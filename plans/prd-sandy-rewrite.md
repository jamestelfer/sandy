### Sandy: TypeScript Rewrite with MCP and Dual Backend

#### Problem Statement

Sandy orchestrates sandboxed TypeScript execution for AWS queries using ephemeral VMs. The current implementation is a ~250-line Bash script that shells out to the Shuru CLI for everything. This makes it difficult to extend (no type safety, no testable abstractions), ties it to a single VM backend, and limits distribution to "copy this script." Adding Docker as an alternative backend and exposing Sandy as an MCP server would broaden its reach, but doing so in Bash would compound the existing maintainability problems.

#### Solution

Rewrite Sandy in TypeScript, compiled to a standalone executable via Bun. The rewrite introduces:

- A backend abstraction over Shuru and Docker, so scripts run identically in either environment
- An MCP server mode (`sandy mcp`) that exposes Sandy's capabilities as tools and resources, alongside the existing CLI
- A session model with human-readable names that accumulates output across runs
- A proper build, test, and distribution pipeline

The single Bun binary replaces the Bash script as the entry point. It is distributed via GitHub releases and a Homebrew tap — never committed to the repository.

#### Requirements

##### Backend abstraction

1. The backend interface shall define `imageCreate`, `imageDelete`, `imageExists`, and `run` operations.
2. When `sandy run` is invoked, the system shall delegate to the backend selected in the user's configuration.
3. While a script is executing, the backend shall stream stdout and stderr to the caller in real time.
4. While a script is executing, the backend shall parse stdout lines prefixed with `[-->` as progress messages and forward them via the `onProgress` callback.
5. When a `run` completes, the backend shall return the exit code, captured stdout, captured stderr, and the list of files written to the output directory.
6. The system shall provide a `progress(message)` helper function available to scripts inside the VM/container that writes `[--> ${message}\n` to stdout.

##### Shuru backend

7. When `imageCreate` is called with the Shuru backend, the system shall shell out to `shuru checkpoint create` with the bootstrap files mounted at `/tmp/bootstrap/`.
8. When `imageDelete` is called with the Shuru backend, the system shall shell out to `shuru checkpoint delete sandy`.
9. When `imageExists` is called with the Shuru backend, the system shall shell out to `shuru checkpoint list` and check for the `sandy` checkpoint.
10. When `run` is called with the Shuru backend, the system shall use the `@superhq/shuru` SDK to start a sandbox from the `sandy` checkpoint, mount the script directory read-only and the output directory read-write, expose the host IMDS port, restrict network to `*.amazonaws.com` and `*.aws.amazon.com`, and execute the script via `sb.spawn()`.
11. When `run` is called with the Shuru backend, the system shall set `AWS_EC2_METADATA_SERVICE_ENDPOINT` to `http://10.0.0.1:<imdsPort>` inside the VM.

##### Docker backend

12. When `imageCreate` is called with the Docker backend, the system shall use dockerode to build a Docker image tagged `sandy:latest` from a generated Dockerfile that COPYs bootstrap files to `/tmp/bootstrap/` and runs `init.sh`.
13. When `imageDelete` is called with the Docker backend, the system shall use dockerode to remove the `sandy:latest` image.
14. When `imageExists` is called with the Docker backend, the system shall use dockerode to inspect the `sandy:latest` image.
15. When `run` is called with the Docker backend, the system shall use dockerode to create an ephemeral container from `sandy:latest` with the script directory as a read-only bind mount, the output directory as a read-write bind mount, and environment variables set for IMDS and region.
16. When `run` is called with the Docker backend, the system shall set `AWS_EC2_METADATA_SERVICE_ENDPOINT` to `http://host.docker.internal:<imdsPort>` inside the container.
17. When a Docker container exits successfully, the system shall remove the container automatically.
18. If a Docker container exits with a non-zero code, then the system shall log the container ID before removing it.
19. The Docker image shall use `pnpm run -s entrypoint` as its `ENTRYPOINT`, where the `entrypoint` script runs `pnpm run -s tsc && pnpm run -s invoke`.

##### Bootstrap and init

20. The `init.sh` script shall use `/tmp/bootstrap/` as the source path for all bootstrap files in both Shuru and Docker contexts.
21. If the Netskope MitM certificate is not found at the expected host path, then `init.sh` shall skip certificate installation and continue without error.
22. The bootstrap files (`init.sh`, `package.json`, `tsconfig.json`, `node_certs.sh`, `entrypoint`) shall be embedded in the Bun binary at build time.

##### Session management

23. When `sandy run` is called without an active session (MCP) or without `--session` (CLI), the system shall auto-create a session with a name generated by `human-id` (lowercase, `-` separator).
24. While an MCP server instance is running, the system shall maintain at most one active session in memory.
25. When a session is active, all `sandy_run` invocations shall write output to `.sandy/<session-name>/` in the current working directory.
26. When the first session is created in a working directory, the system shall create `.sandy/.gitignore` containing `*`.
27. When `sandy_run` auto-creates a session, the system shall include the session name in the tool result so the agent is aware of it.
28. When `sandy_resume_session` is called with a session name, the system shall set that name as the active session without validating that the directory exists (it will be created on the next run if needed).

##### Configuration

29. The system shall read configuration from `$XDG_CONFIG_HOME/sandy/config.json`, defaulting to `~/.config/sandy/config.json`.
30. The configuration file shall contain `{ "backend": "docker" | "shuru" }`.
31. When `sandy config` is called with no flags, the system shall print the current backend setting.
32. When `sandy config --docker` or `sandy config --shuru` is called, the system shall update the configuration file.
33. If no configuration file exists, then the system shall default to the `shuru` backend.

##### CLI

34. The CLI shall expose the following subcommands: `config`, `image`, `check`, `run`, `mcp`.
35. The `image` subcommand shall accept `create` or `delete` as a positional argument.
36. The `check` subcommand shall accept `baseline` or `connect` as a positional argument, and `--imds-port` as a required flag for `connect`.
37. The `run` subcommand shall accept `--imds-port` (required), `--script` (required), `--region` (optional, default `us-west-2`), `--session` (optional), `--output-dir` (optional), and trailing arguments after `--`.
38. While a script is running via the CLI, the system shall stream stdout and stderr directly to the terminal.

##### MCP server

39. When `sandy mcp` is invoked, the system shall start an MCP server using stdio transport.
40. The MCP server shall expose the following tools: `sandy_image` (action: create|delete), `sandy_check` (action: baseline|connect, imdsPort), `sandy_run` (script, imdsPort, region, args), `sandy_resume_session` (sessionName).
41. The MCP server shall expose the following resources: `sandy://scripting-guide` (scripting conventions, available packages, constraints) and `sandy://examples/{name}` (reference script implementations).
42. While a script is running via MCP, the system shall forward progress messages (parsed from `[-->` prefix) as MCP `notifications/progress`.
43. When an MCP tool call completes, the system shall return the full stdout, stderr, and exit code in the tool result.

##### Script execution environment

44. The system shall set `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` to `IPv4` inside the VM/container.
45. The system shall set `AWS_EC2_METADATA_V1_DISABLED` to `true` inside the VM/container.
46. The system shall set `AWS_REGION` to the specified region (default `us-west-2`) inside the VM/container.
47. The system shall set `SANDY_OUTPUT` to `/workspace/output` inside the VM/container.
48. Scripts shall be type-checked by `tsc` before execution; if type-checking fails, execution shall not proceed.
49. Scripts shall run under Node.js with the `--permission` flag, blocking `child_process` usage.

##### Docker isolation trade-offs

50. Where the Docker backend is selected, the system shall not enforce domain-based network restrictions (this is a documented trade-off versus Shuru).
51. Where the Docker backend is selected, the system shall document that network isolation is weaker than the Shuru backend.

##### Build and distribution

52. The system shall compile to a standalone executable via `bun build --compile`.
53. The build shall embed bootstrap files, the scripting guide, and example scripts into the binary.
54. The system shall use Biome for linting and formatting, configured with 2-space indentation, no semicolons, and mandatory curly braces.
55. The system shall use `bun test` as the test runner.

##### Testing

56. Unit tests shall cover the backend interface (using a fake backend), CLI argument parsing, MCP tool dispatch, configuration read/write, progress parsing, and session management.
57. Integration tests shall use `test.skipIf` to run only when the `INTEGRATION` environment variable is set to `true`.
58. Integration tests shall cover Docker backend operations (image create/delete, script execution).
59. Integration tests for the Shuru backend shall exist but are expected to run only in environments where Shuru is available.

##### CI

60. When a push or pull request targets the main branch, GitHub Actions shall run the build and unit test steps.
61. GitHub Actions workflows shall use the most recent supported version tag for all actions.

#### Implementation Decisions

**Backend abstraction.** A TypeScript interface (`Backend`) with four methods: `imageCreate`, `imageDelete`, `imageExists`, `run`. The `run` method accepts an options object and an `onProgress` callback. Both `ShruruBackend` and `DockerBackend` implement this interface. CLI and MCP code depend only on the interface, never on a concrete backend. Tests use a `FakeBackend` that records calls and returns configurable results.

**Shuru integration.** Checkpoint lifecycle (create, delete, list) uses shell-out to the `shuru` CLI because the SDK does not expose these operations. Script execution uses the `@superhq/shuru` SDK (`Sandbox.start`, `sb.spawn`) for streaming and programmatic control.

**Docker integration.** Uses `dockerode` for all Docker operations. The Dockerfile is generated at `imageCreate` time from an embedded template, using the same `init.sh` that Shuru uses. The container entrypoint is `pnpm run -s entrypoint`, which chains `tsc` then `node --permission`. IMDS endpoint uses `host.docker.internal` instead of the Shuru-specific `10.0.0.1`. The default Docker socket (`/var/run/docker.sock`) is used without auto-detection of alternative runtimes.

**Progress protocol.** Scripts emit progress by writing lines prefixed with `[-->` to stdout. A shared progress parser strips the prefix and invokes the `onProgress` callback. A `progress()` helper function is provided for scripts to use. In MCP mode, progress messages become `notifications/progress`. In CLI mode, they appear in the terminal output stream as-is.

**Session naming.** Uses the `human-id` package configured for lowercase words with `-` separator. Names are checked against existing `.sandy/` subdirectories to avoid collisions. The MCP server holds the active session name in memory (no persistence). The CLI accepts `--session` or auto-generates.

**MCP resources.** The scripting guide (conventions, constraints, available packages) and example scripts are served as MCP resources. The companion skill's SKILL.md instructs agents to read these resources for scripting details. Resource content is embedded in the binary at build time from source markdown and TypeScript files.

**Configuration.** XDG-compliant config file at `~/.config/sandy/config.json`. Only contains `backend` for now. Default is `shuru` when no config exists.

**Embedded assets.** Bun's file embedding bundles bootstrap files, Dockerfile template, scripting guide, and examples into the compiled binary. These are extracted to temp directories as needed (e.g., during `imageCreate`).

**Entrypoint script.** A new `entrypoint` script in the bootstrap directory runs `pnpm run -s tsc && pnpm run -s invoke`. This is the Docker `ENTRYPOINT` and replaces the two-step `typecheck` then `invoke` pattern. The `invoke` npm script receives the script path and args: `pnpm run -s entrypoint -- /workspace/scripts/foo.ts arg1 arg2`.

#### Testing Decisions

**Unit tests** cover all modules except the concrete backend implementations. The fake backend verifies that CLI and MCP code construct the right `RunOptions`, handle results correctly, and forward progress. Config tests use a temp directory. Progress parser tests cover the `[-->` prefix extraction, passthrough of normal lines, and edge cases (empty messages, partial prefixes). Session tests verify name generation, directory creation, and gitignore.

**Integration tests** use `test.skipIf(() => process.env.INTEGRATION !== "true")` and are colocated with unit tests or in a parallel directory structure. Docker integration tests exercise the full lifecycle: image create, script run (with a trivial script), output file verification, image delete. Shuru integration tests mirror the Docker tests. Both assume the respective runtime is available and an IMDS server is not required (use the `baseline` check script which needs no AWS credentials).

**No mocking of dockerode or the Shuru SDK in unit tests.** The backend interface is the seam — unit tests stay above it (fake backend), integration tests go below it (real backend). This avoids brittle mocks that mirror implementation details.

#### Out of Scope

- **Remote Docker hosts** — only local Docker daemon via default socket
- **Windows support** — may work with Docker but not tested or targeted
- **Automated release pipeline** — goreleaser or equivalent deferred; manual GitHub releases for now
- **npm or PyPI publishing** — distribution is Homebrew tap and GitHub releases only
- **Plugin auto-install** — users install the binary manually
- **Multi-session management** — one active session at a time
- **MCP streaming of tool results** — MCP spec does not support it; progress notifications used instead
- **Docker network isolation** — no domain-based egress filtering in Docker mode
- **Alternative Docker socket detection** — no auto-detection for OrbStack, Rancher Desktop, etc.

#### Further Notes

- The Netskope MitM certificate handling in `init.sh` is specific to corporate environments that intercept TLS. It must remain optional — the init script skips it when the certificate is absent.
- The `human-id` package should be evaluated for binary size impact since it ships with word lists. If too large, a small embedded word list (~50 adjectives, ~50 nouns) is an acceptable alternative.
- The `--permission` flag on Node.js blocks `child_process` in both backends. This is the primary code-execution safety boundary. Network restrictions are a secondary layer (strong in Shuru, absent in Docker).
- MCP resources are explicitly loaded by clients. The skill wrapper's SKILL.md should instruct agents to read `sandy://scripting-guide` before writing scripts. Whether agents actually do this depends on the MCP client implementation — this is a known gap to monitor.
- The `sandy_resume_session` tool exists to handle MCP server restarts gracefully. If the agent remembers the session name from a previous `sandy_run` result, it can restore continuity without creating a new output directory.
