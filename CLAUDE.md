# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Sandy

Sandy is a Claude Code skill that runs TypeScript scripts inside disposable Shuru microVMs with AWS SDK access via IMDS. It's designed for AI agents to safely execute read-only AWS queries without exposing credentials. The project is structured as a Claude plugin (`/.claude-plugin/marketplace.json`) containing a single skill at `isolate/skills/sandy/`.

## Project Layout

All source lives under `isolate/skills/sandy/`:

- `scripts/sandy` — Bash orchestration script (entry point for all operations)
- `scripts/bootstrap/` — VM initialization (`init.sh`, `package.json`, `tsconfig.json`)
- `scripts/checks/` — Health check TypeScript files (`baseline.ts`, `connect.ts`)
- `resources/examples/` — Reference script implementations
- `SKILL.md` — Comprehensive skill documentation (the authoritative reference)

## Commands

All commands run through the `sandy` Bash script. There is no Makefile, no npm workspace at the root, and no CI/CD pipeline.

```bash
# One-time VM snapshot setup
sandy snapshot create
sandy snapshot list
sandy snapshot delete

# Health checks
sandy check baseline                          # packages + file I/O (no AWS)
sandy check connect --imds-port <port>        # AWS IMDS connectivity

# Run a script
sandy run --imds-port <port> --script <path> [--region <region>] [--session <id>] [-- args...]
```

There is no linting or formatting tooling. The only code quality step is `tsc` (TypeScript type checking), which runs automatically as part of `sandy run` before script execution.

There is no test framework. The `check baseline` and `check connect` commands serve as manual verification.

## Architecture

```
Agent calls: sandy run --script user_script.ts --imds-port <port>
  |
  v
sandy (Bash) — validates checkpoint exists, parses flags
  |
  v
Shuru (ephemeral VM) — mounts scripts read-only, output dir read-write
  |
  v
Inside VM:
  1. tsc — type-checks all scripts; errors stop execution
  2. node --permission — runs compiled JS (blocks child_process, restricts network)
  3. AWS SDK resolves credentials via IMDS at http://10.0.0.1:<port>
```

Key constraints enforced by the VM:
- **No child processes** — Node's `--permission` flag blocks `child_process`. Use SDK clients directly, not AWS CLI.
- **Restricted network** — Only `*.amazonaws.com` and `*.aws.amazon.com` allowed.
- **Ephemeral** — Each run gets a fresh VM from a snapshot. No state persists between runs.
- **No static credentials** — AWS SDK resolves credentials via IMDS (IMDSv2 only).

Output files go to `process.env.SANDY_OUTPUT` inside the VM, synced back to `.sandy/<session>/` on the host.

## Scripting Conventions

**Mandatory: async generators for all AWS iteration.** Every paginated AWS call and batch-describe loop must be an `async function*` generator that yields results incrementally. Do not accumulate results into arrays. This ensures progress is visible immediately, partial results survive failures, and callers control iteration.

Other conventions (from SKILL.md):
- Show terse progress to stdout so the user knows the script is alive
- Wrap outer-loop iterations in try/catch to provide partial results on failure
- Write JSON chunks to `SANDY_OUTPUT` as you go to preserve results before failures
- Use `process.argv.slice(2)` for script arguments

## Dependencies

The VM snapshot includes ~150 AWS SDK v3 service clients (all `@aws-sdk/client-*` at `latest`) plus utility libraries: `arquero`, `asciichart`, `console-table-printer`, `@fast-csv/format`, `jmespath`. Full list in `scripts/bootstrap/package.json`. Runtime is Node.js 24 with pnpm.
