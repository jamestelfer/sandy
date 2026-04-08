# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What is Sandy

Sandy is a CLI tool and Claude Code skill that runs TypeScript scripts inside sandboxed environments (Shuru microVMs or Docker containers) with AWS SDK access via IMDS. It is designed for AI agents to safely execute read-only AWS queries without exposing credentials.

This is a Bun TypeScript project currently in Phase 1 (scaffold + dummy backend + full CLI). Phases 3 and 5 will add the real Shuru and Docker backends. The original Bash implementation remains under `isolate/skills/sandy/` for reference only — do not modify it.

## Project Layout

```
src/
  main.ts              Entry point (bun build --compile target)
  backend.ts           Backend interface definition
  dummy-backend.ts     DummyBackend: records calls, returns configurable results
  config.ts            Read/write $XDG_CONFIG_HOME/sandy/config.json
  session.ts           Session management (human-id names, .sandy/<name>/ dirs)
  progress.ts          Progress line parser ([-->  prefix detection)
  types.ts             Shared types (RunOptions, RunResult, env var constants)
  cli/
    config.ts          sandy config [--docker|--shuru]
    image.ts           sandy image create|delete
    check.ts           sandy check baseline|connect
    run.ts             sandy run --script <path> --imds-port <n>
    mcp.ts             sandy mcp (stub — Phase 4)
  *.test.ts            Unit tests alongside source files
isolate/skills/sandy/  Original Bash implementation (reference only)
plans/                 Implementation phase plans
dist/                  Built binary (gitignored)
```

## Commands

```bash
# Development
bun test              # Run unit tests
bun run lint          # Biome lint check
bun run lint:fix      # Biome lint with auto-fix
bun run format        # Biome format check
bun run format:fix    # Biome format with auto-fix
bun run build         # Compile standalone binary to dist/sandy
bun run agent         # lint:fix + format:fix + build + test (full CI cycle)

# CLI (built binary)
sandy config                    # Show current backend (default: shuru)
sandy config --docker           # Switch to Docker backend
sandy config --shuru            # Switch to Shuru backend
sandy image create              # Create sandbox image
sandy image delete              # Delete sandbox image
sandy check baseline            # Run baseline health check
sandy check connect --imds-port <n>   # Run connectivity check
sandy run --script <path> --imds-port <n> [--region <r>] [--session <s>] [-- args...]
sandy mcp                       # Start MCP server (Phase 4 — not yet implemented)
```

## Biome Configuration

Code style enforced by Biome (`biome.json`):
- 2-space indent
- No semicolons
- Double quotes
- Trailing commas
- Mandatory curly braces (`useBlockStatements`)
- Line width: 100

## Architecture

```
CLI entry (src/main.ts)
  → reads config ($XDG_CONFIG_HOME/sandy/config.json)
  → instantiates Backend (Phase 1: DummyBackend for both shuru/docker)
  → dispatches to CLI handler (src/cli/*.ts)
    → handler calls backend methods (imageCreate, imageDelete, run, etc.)
    → backend onProgress callback streams [-->-prefixed lines
```

**Backend interface** (`src/backend.ts`):
- `imageCreate()` — create/build the sandbox image
- `imageDelete()` — delete the sandbox image
- `imageExists()` → boolean
- `run(opts: RunOptions, onProgress: (msg: string) => void)` → `RunResult`

**Progress protocol**: the real backend (Phase 3/5) reads stdout from the VM/container, parses lines with `parseProgressLine()`, and calls `onProgress(message)` for `[-->` prefixed lines. The CLI handler then formats and prints them. Normal stdout is captured in `RunResult.stdout`.

**Session**: a human-readable name (`human-id` format, e.g. `happy-fox-trail`) identifying an output directory at `.sandy/<name>/`. Auto-generated if not provided; `.sandy/.gitignore` with `*` is created on first use.

**Config** (`$XDG_CONFIG_HOME/sandy/config.json` or `~/.config/sandy/config.json`):
```json
{ "backend": "shuru" }
```
Valid backends: `"shuru"` (default), `"docker"`.

## Env var constants (`src/types.ts`)

| Constant | Value |
|----------|-------|
| `ENV_ENDPOINT_MODE` | `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` |
| `ENV_ENDPOINT_MODE_VALUE` | `IPv4` |
| `ENV_V1_DISABLED` | `AWS_EC2_METADATA_V1_DISABLED` |
| `ENV_V1_DISABLED_VALUE` | `true` |
| `ENV_REGION` | `AWS_REGION` |
| `ENV_SANDY_OUTPUT` | `SANDY_OUTPUT` |
| `VM_SCRIPTS_DIR` | `/workspace/scripts` |
| `VM_OUTPUT_DIR` | `/workspace/output` |
| `DEFAULT_REGION` | `us-west-2` |

## Testing

Tests use `bun test` (no external test framework). Test files live alongside source as `*.test.ts`.

**DummyBackend** (`src/dummy-backend.ts`) is the permanent test double for the Backend interface. It:
- Records every call in `backend.calls: BackendCall[]`
- Returns configurable results via `backend.runResult`, `backend.imageExistsResult`
- Calls `onProgress` for each string in `backend.progressLines`

Use DummyBackend in CLI and higher-level tests instead of mocking — this tests real dispatch paths.

**Test isolation**: config tests set `process.env.XDG_CONFIG_HOME` to a temp dir; session tests `chdir` to a temp dir. Both clean up in `afterEach`.

```bash
# Run all tests
bun test

# Run a single test file
bun test src/config.test.ts
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@biomejs/biome` | Lint + format |
| `@superhq/shuru` | Shuru SDK (Phase 3) |
| `human-id` | Generate readable session names |
