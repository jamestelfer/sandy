# Sandy

**Sandy runs TypeScript AWS queries inside a disposable sandbox, giving AI coding agents full SDK access and cross-account aggregation with no host credentials exposed.**

Sandy is for AI coding agents — Claude Code and peers — running against multi-account AWS estates, and the humans who drive them. Agents describe an investigation in natural language. Sandy executes the generated TypeScript in a fresh microVM or container. The script uses the full AWS SDK to gather and collate results, then returns only what the agent needs. The sandbox and IMDS flow exist because agents should not hold host-level credentials or reach AWS directly.

```mermaid
flowchart LR
    subgraph AgentBox["Agent sandbox"]
        A["Coding agent"]
    end

    subgraph Host["Host (outside agent sandbox)"]
        direction TB
        CLI["sandy run<br/>(CLI)"]
        MCP["sandy mcp<br/>(MCP server)"]
        IMDS["imds-broker<br/>(MCP)"]
    end

    subgraph Sandbox["Ephemeral sandbox<br/>(Shuru microVM or Docker container)"]
        N["Node.js +<br/>AWS SDK v3"]
    end

    AWS((("AWS APIs")))

    A -- "Bash: sandy run" --> CLI
    A -- "MCP: sandy_run" --> MCP
    A -- "MCP: start_server" --> IMDS
    CLI -- "spawn, mount script" --> N
    MCP -- "spawn, mount script" --> N
    N -- "IMDS: GET credentials" --> IMDS
    N -- "HTTPS to *.amazonaws.com" --> AWS

    classDef consumer fill:#e6f3ff,stroke:#2b6cb0,color:#1a365d
    classDef core fill:#fefcbf,stroke:#b7791f,color:#5f370e
    classDef sandboxed fill:#e9f7ef,stroke:#276749,color:#22543d
    classDef external fill:#fce4ec,stroke:#b83280,color:#702459
    class A consumer
    class CLI,MCP,IMDS core
    class N sandboxed
    class AWS external
```

## How to use it

- **As an MCP server** — `sandy mcp`, registered automatically by the `sandy-mcp` Claude Code plugin. Exposes the `sandy_image`, `sandy_check`, `sandy_run`, `sandy_create_session`, `sandy_resume_session`, and `prime` tools, plus embedded `sandy://skills/mcp/...` resources for script-authoring guidance.
- **As a CLI** — `sandy run --script path/to/script.ts --imds-port <port>`. Same backends, same guarantees. Suited to scripted workflows and agents that prefer driving binaries through a shell rather than MCP.

Both modes select from the same `Backend` implementation and share every runtime constraint.

## Why

Two workarounds dominate AI-agent access to AWS today, and both have sharp edges.

- **Published AWS MCP servers** expose a per-API-call surface against a single account. The agent issues many calls and collates the results itself, burning tokens on glue work. Sandy runs the aggregation inside the sandbox with the full AWS SDK v3, returns only what the agent asked for, and reaches any account available through `imds-broker`.
- **Unrestricted shell plus the `aws` CLI** is fast but gives the agent host-level access and visibility into static credentials. Sandy keeps the agent inside its own sandbox, routes credentials through IMDS into the microVM, and blocks child processes inside the VM via Node's permission model.

## Installation

> [!IMPORTANT]
> **On macOS** local signing of the binary is required for direct and mise
> downloads in some environments: in particular when managed by an MDM profile.
>
> If you run `sandy --help; echo "Exit code $?"`, you're running into this issue.
>
> **Follow the signing instructions** with your install method to fix this.

Unsigned binaries that access native APIs are _sometimes_ blocked by policy.
This application bundles the ability to access the Shuru API, which _may_ cause
the issue.

<details>
<summary><strong>Homebrew (macOS)</strong></summary>

```sh
brew install jamestelfer/tap/sandy
```

</details>

<details>
<summary><strong>mise</strong></summary>

[mise](https://mise.jdx.dev/) installs directly from GitHub Releases via the [github backend](https://mise.jdx.dev/dev-tools/backends/github.html):

```sh
mise config set --cd "${MISE_CONFIG_DIR:-~/.config/mise}" \
  tools.github:jamestelfer/sandy.version latest
mise config set --cd "${MISE_CONFIG_DIR:-~/.config/mise}" \
  tools.github:jamestelfer/sandy.postinstall \
  'xattr -dr com.apple.quarantine "${MISE_TOOL_INSTALL_PATH}" 2>/dev/null; codesign --remove-signature "${MISE_TOOL_INSTALL_PATH}/sandy" 2>/dev/null; codesign -s - --force "${MISE_TOOL_INSTALL_PATH}/sandy"'

mise install
```

</details>

<details>
<summary><strong>npm</strong></summary>

```sh
npm install -g @jamestelfer/sandy
```

</details>

<details>
<summary><strong>Install script</strong></summary>

The install script fetches the correct binary for your platform from [GitHub Releases](https://github.com/jamestelfer/sandy/releases):

```sh
# download and install with binary attestation
curl -fsSL -o install.sh https://github.com/jamestelfer/sandy/releases/latest/download/install.sh \
  && gh attestation verify install.sh --repo jamestelfer/sandy \
  && chmod u+x install.sh \
  && ./install.sh


# or for YOLO mode where `gh` is not in use
curl -fsSL https://github.com/jamestelfer/sandy/releases/latest/download/install.sh | sh
```

After installation, locally sign the binary to avoid MDM issues:

```sh
bin="~/.local/bin/sandy";
xattr -dr com.apple.quarantine "${bin}" 2>/dev/null || true; 
codesign --remove-signature "${bin}" 2>/dev/null || true; 
codesign -s - --force "${bin}" && codesign -dv "${bin}" ;
```

</details>

<details>
<summary><strong>Nix</strong></summary>

Install directly from the flake into your profile:

```sh
nix profile install github:jamestelfer/sandy
```

</details>

<details>
<summary><strong>Manual download</strong></summary>

Pre-built binaries for Linux and macOS (amd64/arm64) are on the [releases page](https://github.com/jamestelfer/sandy/releases). Download the archive for your OS and architecture, extract, and place the binary on your `PATH`.

Each archive ships with a build provenance attestation. Verify it before extracting:

```sh
gh attestation verify sandy-<version>-<os>-<arch>.tar.gz --owner jamestelfer
```

</details>

<details>
<summary><strong>Build from source</strong></summary>

Requires Bun 1.3 or newer.

```sh
git clone https://github.com/jamestelfer/sandy
cd sandy
bun install
bun run build
./dist/sandy --help
```

</details>

### Claude Code plugins

Sandy ships two Claude Code plugins, one per channel. Neither installs the binary — install via one
of the methods above first.

| Plugin | Channel | MCP server | Install |
|---|---|---|---|
| `sandy-mcp` | MCP tools | Yes — registers `sandy mcp` | `/plugin install sandy-mcp` |
| `sandy-cli` | Shell commands | No | `/plugin install sandy-cli` |

Install `sandy-mcp` when the agent has MCP support and should call `sandy_run` and friends
directly. Install `sandy-cli` when the agent drives Sandy through shell commands instead. Install
both to support either style, or when unsure which the agent will use — the skills carry distinct
names and don't collide.

Each plugin's skill is a short bootstrap: it tells the agent to call that channel's `prime` — the
MCP `prime` tool for `sandy-mcp`, `sandy prime` for `sandy-cli` — and read the complete output
before acting. The instructions themselves live in the embedded skill docs
(`embedded/skills/mcp/SKILL.md` and `embedded/skills/cli/SKILL.md`), not in the published skill
files, so `prime` always reflects the current binary.

### Prerequisites

- Docker or [Shuru](https://shuru.run/) — select with `sandy config` (defaults to Docker)
- [imds-broker](https://github.com/jamestelfer/imds-broker) — serves AWS credentials via IMDS on the host
- Claude Code (optional, required only for the plugins)

Create the sandbox image once, then verify the environment:

```bash
sandy image create
sandy check baseline                        # no AWS credentials needed
sandy check connect --imds-port <port>      # verifies AWS connectivity
```

## Usage

### Via MCP

The `sandy-mcp` Claude Code plugin launches `sandy mcp` and exposes four tools plus one resource. Start an IMDS server from the agent (through the `imds-broker` MCP), then call `sandy_run` with the port and the script:

```
sandy_image(action: "create")
sandy_check(action: "baseline")
sandy_run(script: "…", imdsPort: 9001, region: "us-west-2")
```

Progress streams via `notifications/progress`. Session state persists for the lifetime of the MCP process and resumes with `sandy_resume_session`.

Read `sandy://skills/mcp/resources/scripting-guide.md` from the MCP server for the full scripting contract.

### Via CLI

```bash
sandy run \
  --imds-port <port> \
  --script path/to/script.ts \
  --session <id> \
  -- [script args...]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--imds-port <port>` | Yes | Port of the `imds-broker` IMDS server on the host |
| `--script <path>` | Yes | Path to the TypeScript file to execute |
| `--region <region>` | No | AWS region (default `us-west-2`) |
| `--session <id>` | No | Session identifier; groups output under `.sandy/<id>/` |
| `--output-dir <dir>` | No | Override the host output directory |
| `-- [args...]` | No | Arguments forwarded to the script via `process.argv` |

Script output written to `/workspace/output` inside the sandbox syncs back to `.sandy/<session>/` on the host.

### Writing scripts

Scripts are TypeScript with access to every `@aws-sdk/client-*` package, plus `arquero`, `simple-ascii-chart`, `console-table-printer`, `@fast-csv/format`, and `jmespath`. Two patterns are mandatory.

- **Use `async function*` generators for paginated AWS calls.** Progress appears immediately, partial results survive failures, and callers decide when to stop.
- **Call the SDK directly.** No `child_process`. No shelling out to `aws`.

```typescript
import { ECSClient, ListServicesCommand } from "@aws-sdk/client-ecs"

const ecs = new ECSClient({ region: process.env.AWS_REGION })

async function* listServiceArns(cluster: string): AsyncGenerator<string[]> {
  let nextToken: string | undefined
  do {
    const resp = await ecs.send(new ListServicesCommand({ cluster, nextToken }))
    const arns = resp.serviceArns ?? []
    if (arns.length > 0) yield arns
    nextToken = resp.nextToken
  } while (nextToken)
}

for await (const batch of listServiceArns("my-cluster")) {
  console.log(`Got ${batch.length} services`)
}
```

Full guide: `sandy://skills/mcp/resources/scripting-guide.md` via MCP, or `sandy resource sandy://skills/cli/resources/scripting-guide.md` via CLI.

## How it works

Sandy compiles to a single Bun binary with the bootstrap filesystem, scripting guide, and example scripts embedded at build time. The binary hosts both the CLI and the MCP server. Both dispatch through the same `Backend` abstraction (`imageCreate`, `imageDelete`, `imageExists`, `run`).

On `sandy run`, the active backend stages the bootstrap directory, mounts the script directory read-only into the sandbox, runs `tsc` for type-checking, then invokes `node --permission` on the compiled JavaScript. The AWS SDK resolves credentials from `http://10.0.0.1:<imds-port>` — served by `imds-broker` on the host — so no credential ever touches VM disk. Subprocess stdout and stderr stream through one `OutputHandler` to host stderr; lines prefixed `[-->` are stripped and forwarded as progress (bold text for the CLI, `notifications/progress` for MCP). The sandbox is discarded on exit.

Backends are modality-agnostic. Swapping Shuru for Docker changes where the process runs and which egress policy applies. The progress protocol, mount layout, and bootstrap contract stay identical.

## Caveats

- **Shuru runs on macOS and arm64 Linux only.** Use the Docker backend on x86_64 Linux or in CI.
- **Docker does not enforce domain-based egress filtering.** The Shuru backend restricts egress to `*.amazonaws.com` and `*.aws.amazon.com`; Docker does not. Prefer Shuru for scripts from untrusted sources.
- **Credentials depend on `imds-broker`.** Sandy does not issue or cache credentials. The broker must be reachable on the IMDS port you pass in.
- **One MCP session at a time.** The MCP server holds a single active session in memory. Resume with `sandy_resume_session`; parallel sessions are not supported.
- **No persistent state between runs.** Each run starts from a clean sandbox image. Recreate the image after editing `embedded/bootstrap/` files.
- **Skill source of truth.** `embedded/skills/mcp/SKILL.md` and `embedded/skills/cli/SKILL.md` are canonical for the MCP and CLI skill content respectively. The published plugin skills (`plugins/mcp/skills/sandy-mcp/SKILL.md`, `plugins/cli/skills/sandy-cli/SKILL.md`) are bootstraps that dispatch to `prime` — they carry no copy of the instructions to keep in sync.

## Acknowledgements

- [Shuru](https://github.com/nicholasgasior/shuru) — ephemeral microVM runtime
- [Bun](https://bun.com) — runtime, test runner, and single-binary compiler
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code](https://claude.ai/code) — the primary agent Sandy was designed with

## License

Apache 2.0 — see [LICENSE](LICENSE).
