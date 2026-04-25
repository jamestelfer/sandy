# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Voice

Apply these rules to all prose, commit messages, PR descriptions, and user-facing text.

- Technical-professional register. Use terms directly without over-explanation.
- Use Conventional Commit leads for all commit messages and PR descriptions.
- Guides: second person, imperative mood. Start instructions with the verb.
- Reference: third person, declarative mood. Describe what things are and do.
- No first person ("I", "we") anywhere except `Acknowledgements`.
- No filler ("Let's dive in", "It's important to note", "As mentioned earlier").
- No hedging ("You might want to consider", "It's generally a good idea").
- No rhetorical questions. State the information instead.
- No apologetic framing ("This might seem complicated, but…").
- Sentences under 20 words where possible. Single-sentence paragraphs are fine.
- British/Australian spelling ("favour", "organise", "colour", "licence" as noun).

## What is Sandy

Sandy runs TypeScript scripts inside sandboxed environments (Shuru microVMs or Docker containers) with AWS SDK access via IMDS, for AI agents to safely execute read-only AWS queries without exposing credentials. Built on Bun — uses Bun as runtime, test runner, and binary compiler.

Two entry points: **CLI** (`sandy`) for direct use, **MCP server** (`sandy mcp`) for AI agent use via Model Context Protocol.

## Project Layout

```
src/core/           Shared types and config persistence
src/sandbox/        Backend interface, implementations, backend factory
src/session/        Session lifecycle and working directory setup
src/resources/      Embedded resources, bootstrap staging, checks, temp dirs
src/execution/      Runtime environment and output scanning utilities
src/output/         Output handling, line writing, progress parsing
src/logging/        Structured logging
src/cli/            CLI parser and command registration
src/cli/commands/   One file per CLI subcommand (config, image, check, run, mcp)
src/mcp/            MCP server with tool/resource registration modules
src/test-support/   Shared test doubles and test helper utilities
embedded/           Files packed into embedded.tar and loaded via memfs at runtime
embedded/bootstrap/ Bootstrap files staged into the sandbox during image creation
embedded/checks/    Baseline and connect check scripts
embedded/skills/    CLI and MCP skill definitions and resources
plans/              Implementation phase plans
```

Unit tests (`*.test.ts`) sit alongside source. Integration tests (`*.integration.test.ts`) skip unless `INTEGRATION=true`.

## Dev Commands

```bash
bun run fix                 # apply lint and format fixes
bun run verify              # non-mutating quality gate: biome check + build + unit tests + Docker integration test
bun run agent               # fix then verify
bun test                    # unit tests only
bun run integration:docker  # Docker integration test
bun run build               # compile binary to dist/sandy
```

Use the fix/verify workflow for commit readiness. `verify` must pass without introducing file changes.

## Commit rules

- Structure commits for review. Keep each commit a clear logical implementation step.
- Keep commits atomic. Move from tested working state to tested working state only.
- Include required test changes in the same commit as the code changes they validate.
- Use Conventional Commit messages for all commits.

## Code Style (Biome)

2-space indent, no semicolons, double quotes, trailing commas, mandatory curly braces, line width 100. Config: `biome.json`.

## Architecture

### Backend abstraction

All sandbox operations go through `Backend` (`src/sandbox/backend.ts`): `imageCreate`, `imageDelete`, `imageExists`, `run` — each accepting an `onProgress` callback. `ShuruBackend` and `DockerBackend` are the real implementations; `DummyBackend` in `src/test-support/dummy-backend.ts` is the permanent test double.

### CLI vs MCP entry paths

Both paths select the same backend from config and call the same `Backend` interface. They differ in how they deliver output:

- **CLI** (`src/main.ts`) — `onProgress` writes bold text to stderr; `src/cli/commands/<cmd>.ts` handles each subcommand
- **MCP** (`src/mcp/server.ts`) — `onProgress` sends `notifications/progress`; holds one `ActiveSession` in memory; exposes tools `sandy_image`, `sandy_check`, `sandy_run`, `sandy_resume_session` and embedded resources via the `sandy://` URI scheme

### Output/progress flow

All subprocess stdout + stderr flow through `OutputHandler` → written to **process stderr** (keeps stdio free for the MCP protocol). Lines prefixed `[-->` are stripped and forwarded to `ProgressCallback`. Backends are modality-agnostic — only the callback differs between CLI and MCP.

### Bootstrap files

`embedded/bootstrap/` files are packed into `embedded.tar` and loaded via memfs. Both backends copy them to a temp staging dir and mount it into the sandbox as `/tmp/bootstrap/`. `init.sh` sets up the Node.js workspace at `/workspace/` inside the sandbox.

## Testing

Use `DummyBackend` in CLI and MCP tests — not mocks. It records calls in `backend.calls`, returns configurable results via `backend.runResult` / `backend.imageExistsResult`, and fires `onProgress` for each string in `backend.progressLines`. This exercises real dispatch paths.

Test isolation: config tests set `process.env.XDG_CONFIG_HOME` to a temp dir; session tests `chdir` to a temp dir. Both restore in `afterEach`.
