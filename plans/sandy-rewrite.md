# Plan: Sandy TypeScript Rewrite

> Source PRD: `docs/prd-sandy-rewrite.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Backend interface**: `imageCreate()`, `imageDelete()`, `imageExists()`, `run(opts, onProgress)` — the seam between CLI/MCP and execution engines. `DummyBackend` implements it for testing.
- **Config**: `$XDG_CONFIG_HOME/sandy/config.json` → `{ "backend": "docker" | "shuru" }`, default `shuru`
- **VM/container paths**: `/workspace/scripts/` (ro mount), `/workspace/output/` (rw mount), `/tmp/bootstrap/` (init source)
- **Env vars inside VM/container**: `AWS_EC2_METADATA_SERVICE_ENDPOINT`, `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE=IPv4`, `AWS_EC2_METADATA_V1_DISABLED=true`, `AWS_REGION`, `SANDY_OUTPUT=/workspace/output`
- **IMDS endpoint**: `http://10.0.0.1:<port>` (Shuru), `http://host.docker.internal:<port>` (Docker)
- **Progress protocol**: `[-->` prefix on stdout lines, parsed by shared module, forwarded via `onProgress` callback
- **Session**: `.sandy/<session-name>/` output dir, `human-id` names (lowercase, `-` separator), in-memory for MCP, `--session` flag for CLI
- **CLI subcommands**: `config [--docker|--shuru]`, `image create|delete`, `check baseline|connect`, `run`, `mcp`
- **MCP tools**: `sandy_image(action)`, `sandy_check(action, imdsPort)`, `sandy_run(script, imdsPort, region, args)`, `sandy_resume_session(sessionName)`
- **MCP resources**: `sandy://scripting-guide`, `sandy://examples/{name}`
- **Container entrypoint**: `pnpm run -s entrypoint` chains `pnpm run -s tsc && pnpm run -s invoke`
- **Package scripts**: `build`, `test`, `lint`, `lint:fix`, `format`, `format:fix`, `agent` (lint:fix + format:fix + build + test)
- **Biome config**: 2-space indent, no semicolons, mandatory curly braces

---

## Phase 1: Project scaffold + dummy backend + full CLI

**Requirements**: 1–6 (backend interface), 23–28 (session), 29–33 (config), 34–38 (CLI), 44–49 (execution env vars — defined as constants), 54–56 (Biome, bun test, unit tests)

### What to build

Stand up the entire project structure and get every CLI subcommand working end-to-end against a dummy backend. This phase produces no real VM/container execution but proves the full architecture: argument parsing flows through the backend interface, config reads/writes persist, sessions generate human-readable names, and progress lines get parsed.

The dummy backend records every call it receives and returns configurable canned results. It stays in the codebase permanently as the test double for higher-level tests (MCP dispatch, CLI integration).

Also produce a CLAUDE.md describing the source layout, commands, and conventions so future work has a reliable reference.

**Package.json scripts:**
- `build` — `bun build --compile` to standalone binary
- `test` — `bun test` (unit tests, integration behind `skipIf`)
- `lint` — `biome lint .`
- `lint:fix` — `biome lint --fix .`
- `format` — `biome format . --check` (verify only, non-zero on diff)
- `format:fix` — `biome format --write .`
- `agent` — `bun run lint:fix && bun run format:fix && bun run build && bun run test`

### Acceptance criteria

- [ ] Bun project compiles and `bun run build` produces a standalone binary
- [ ] `biome.json` configured: 2-space indent, no semicolons, mandatory curly braces
- [ ] All package.json scripts work: `build`, `test`, `lint`, `lint:fix`, `format`, `format:fix`, `agent`
- [ ] `Backend` interface defined with `imageCreate`, `imageDelete`, `imageExists`, `run`
- [ ] `DummyBackend` implements the interface, records calls, returns configurable results
- [ ] `sandy config` prints current backend; `sandy config --docker` / `--shuru` persists to XDG config
- [ ] `sandy image create` / `sandy image delete` dispatches to backend
- [ ] `sandy check baseline` / `sandy check connect --imds-port 9001` dispatches to backend
- [ ] `sandy run --imds-port 9001 --script foo.ts` dispatches to backend with correct `RunOptions`
- [ ] `sandy run` without active session auto-generates a `human-id` name and creates `.sandy/<name>/`
- [ ] `sandy run --session my-session` uses the provided name
- [ ] `.sandy/.gitignore` with `*` created on first session in a directory
- [ ] Progress parser extracts `[-->` prefixed lines and passes through normal lines
- [ ] Unit tests pass for: config, session, progress parser, CLI argument parsing, backend dispatch via dummy
- [ ] CLAUDE.md describes source layout, commands, conventions, and testing approach

---

## Phase 2: CI

**Requirements**: 60–61 (GitHub Actions)

### What to build

GitHub Actions workflow that runs on every push and PR to `main`. Executes `bun run agent` (which chains lint:fix, format:fix, build, test). Uses the most recent supported version tags for all GitHub Actions.

### Acceptance criteria

- [ ] `.github/workflows/ci.yml` runs on push and PR to `main`
- [ ] Workflow installs Bun, runs `bun install`, then `bun run agent`
- [ ] All GitHub Actions use their most recent supported version tag
- [ ] Workflow passes on the current codebase from Phase 1

---

## Phase 3: Shuru backend

**Requirements**: 7–11 (Shuru backend), 20–22 (bootstrap/init), 44–49 (execution environment)

### What to build

Implement the Shuru backend behind the `Backend` interface. Checkpoint operations (create, delete, exists) shell out to the `shuru` CLI. Script execution uses the `@superhq/shuru` SDK — `Sandbox.start()` from the `sandy` checkpoint, `sb.spawn()` for streaming stdout/stderr.

Embedded bootstrap files (init.sh, package.json, tsconfig.json, node_certs.sh, entrypoint) are bundled into the binary via Bun's embed and extracted to a temp directory during `imageCreate`.

The init.sh must skip Netskope certificate installation when the cert file is absent.

### Acceptance criteria

- [ ] `sandy config --shuru && sandy image create` shells out to `shuru checkpoint create` with bootstrap files mounted at `/tmp/bootstrap/`
- [ ] `sandy image delete` shells out to `shuru checkpoint delete sandy`
- [ ] `imageExists` checks `shuru checkpoint list` output for the `sandy` checkpoint
- [ ] `sandy run --imds-port <port> --script <path>` starts a sandbox from the `sandy` checkpoint via SDK
- [ ] Script directory mounted read-only at `/workspace/scripts/`, output directory read-write at `/workspace/output/`
- [ ] Host IMDS port exposed; `AWS_EC2_METADATA_SERVICE_ENDPOINT` set to `http://10.0.0.1:<port>`
- [ ] Network restricted to `*.amazonaws.com` and `*.aws.amazon.com`
- [ ] Stdout/stderr streamed in real time; `[-->` lines forwarded as progress
- [ ] Bootstrap files embedded in the binary and extracted to temp dir at build time
- [ ] `init.sh` skips Netskope cert handling when cert file is absent
- [ ] New `entrypoint` bootstrap script chains `pnpm run -s tsc && pnpm run -s invoke`
- [ ] Integration tests exist, gated by `test.skipIf(() => process.env.INTEGRATION !== "true")`

---

## Phase 4: MCP server

**Requirements**: 39–43 (MCP server), 24, 27–28 (MCP session management)

### What to build

MCP server started via `sandy mcp`, using stdio transport and the `@modelcontextprotocol/sdk`. Exposes four tools and two resource types. Session is held in memory — auto-created on first `sandy_run` call, resumable via `sandy_resume_session`.

Progress messages parsed from `[-->` stdout lines are forwarded as MCP `notifications/progress`. Tool results include full stdout, stderr, exit code, and session name.

Resources serve the scripting guide (conventions, constraints, available packages) and example scripts, both embedded at build time.

### Acceptance criteria

- [ ] `sandy mcp` starts an MCP server on stdio
- [ ] `sandy_image` tool accepts `action: "create" | "delete"` and dispatches to backend
- [ ] `sandy_check` tool accepts `action: "baseline" | "connect"` and `imdsPort`, dispatches to backend
- [ ] `sandy_run` tool accepts `script`, `imdsPort`, `region`, `args`; returns stdout, stderr, exitCode, sessionName
- [ ] First `sandy_run` call auto-creates a session with a `human-id` name; subsequent calls reuse it
- [ ] `sandy_resume_session` sets the active session name without validation
- [ ] Session name included in every `sandy_run` tool result
- [ ] Progress messages forwarded as MCP `notifications/progress`
- [ ] `sandy://scripting-guide` resource returns embedded scripting conventions
- [ ] `sandy://examples/{name}` resource returns embedded example scripts (ec2_describe, ecs_services)
- [ ] Unit tests cover all tool dispatch and resource serving using the dummy backend

---

## Phase 5: Docker backend

**Requirements**: 12–19 (Docker backend), 50–51 (Docker isolation trade-offs)

### What to build

Implement the Docker backend behind the same `Backend` interface using dockerode. `imageCreate` builds a Docker image from a generated Dockerfile that COPYs bootstrap files to `/tmp/bootstrap/` and runs `init.sh` — the same script used by the Shuru backend. The image entrypoint is `pnpm run -s entrypoint`.

`run` creates an ephemeral container with bind mounts for script and output directories, sets IMDS endpoint to `host.docker.internal:<port>`, streams output, and removes the container when done. Logs container ID before removal on non-zero exit.

Uses the default Docker socket. No domain-based network restrictions (documented trade-off).

### Acceptance criteria

- [ ] `sandy config --docker && sandy image create` builds `sandy:latest` Docker image via dockerode
- [ ] Dockerfile COPYs bootstrap files to `/tmp/bootstrap/` and runs `init.sh`
- [ ] Image entrypoint is `pnpm run -s entrypoint`
- [ ] `sandy image delete` removes `sandy:latest` via dockerode
- [ ] `imageExists` inspects `sandy:latest` via dockerode
- [ ] `sandy run` creates container with script dir (ro bind mount) and output dir (rw bind mount)
- [ ] `AWS_EC2_METADATA_SERVICE_ENDPOINT` set to `http://host.docker.internal:<port>`
- [ ] Container auto-removed after run; container ID logged on non-zero exit
- [ ] Stdout/stderr streamed in real time; progress parsing works
- [ ] Integration tests exist, gated by `test.skipIf`
- [ ] No domain-based network restrictions applied (trade-off documented)

---

## Phase 6: Skill + distribution

**Requirements**: 52–53 (build/distribution), skill/plugin structure

### What to build

Wire up the distribution pipeline. `bun build --compile` produces platform binaries. Set up a Homebrew tap for macOS installation. Create the skill/plugin wrapper so Sandy is discoverable as a Claude Code plugin — SKILL.md instructs agents to read MCP resources for scripting details, and plugin config references `sandy mcp` as the MCP server command.

### Acceptance criteria

- [ ] `bun run build` produces standalone binaries for target platforms (darwin-arm64, darwin-x64, linux-arm64, linux-x64)
- [ ] Homebrew tap formula installs the binary and makes `sandy` available on PATH
- [ ] Plugin `marketplace.json` and `plugin.json` updated for MCP-based plugin
- [ ] MCP server config (`mcp.json` or equivalent) references `sandy mcp`
- [ ] SKILL.md instructs agents to read `sandy://scripting-guide` and `sandy://examples/*` resources
- [ ] `sandy mcp` works when invoked via the plugin's MCP config
