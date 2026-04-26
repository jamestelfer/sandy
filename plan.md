# Plan: Re-co-locate tests with implementation

## Scope

Move tests that were left at `src/` root into the directories of the code they validate.
Keep repository contract tests inside `src/`.

## Constraints

- Keep contract tests under `src/**`.
- Do not move tests into `embedded/**`.
- Do not move tests into `plugin/**`.
- Preserve current behaviour and coverage.

## Target moves

### Core

- `src/config.test.ts` -> `src/core/config.test.ts`

### Resources

- `src/tmpdir.test.ts` -> `src/resources/tmpdir.test.ts`
- `src/embedded-fs.test.ts` -> `src/resources/embedded-fs.test.ts`
- `src/bootstrap-staging.test.ts` -> `src/resources/bootstrap-staging.test.ts`
- `src/checks.test.ts` -> `src/resources/checks.test.ts`

### Execution

- `src/run-env.test.ts` -> `src/execution/run-env.test.ts`
- `src/scan-output.test.ts` -> `src/execution/scan-output.test.ts`

### Output

- `src/progress.test.ts` -> `src/output/progress.test.ts`
- `src/line-writer.test.ts` -> `src/output/line-writer.test.ts`
- `src/output-handler.test.ts` -> `src/output/handler.test.ts`

### Logging

- `src/logger.test.ts` -> `src/logging/logger.test.ts`

### Session

- `src/session.test.ts` -> `src/session/session.test.ts`
- `src/workdir.test.ts` -> `src/session/workdir.test.ts`

### Sandbox

- `src/docker-backend.test.ts` -> `src/sandbox/docker-backend.test.ts`
- `src/shuru-backend.test.ts` -> `src/sandbox/shuru-backend.test.ts`
- `src/docker-backend.integration.test.ts` -> `src/sandbox/docker-backend.integration.test.ts`
- `src/shuru-backend.integration.test.ts` -> `src/sandbox/shuru-backend.integration.test.ts`

### Test support

- `src/backend.test.ts` -> `src/test-support/dummy-backend.test.ts`

### CLI and MCP

- `src/mcp-server.test.ts` -> `src/mcp/server.test.ts`
- `src/cli-resource-prime.test.ts` -> `src/cli/commands/resource-prime.test.ts`
- `src/cli.test.ts` -> `src/cli/cli.test.ts` (defer command-level split)

### Contract tests (stay in src)

- Keep `src/embedded-pack.test.ts` in `src/**`
- Keep `src/skill.test.ts` in `src/**`

## Execution order

1. Move tests in batches by domain using `git mv`.
2. Fix relative imports in each moved file.
3. Update integration script paths in `package.json`:
   - `integration:docker` -> `src/sandbox/docker-backend.integration.test.ts`
   - `integration:shuru` -> `src/sandbox/shuru-backend.integration.test.ts`
4. Run checks after each batch:
   - `bun test`
5. Run final gate:
   - `bun run verify`

## Acceptance criteria

- Root-level stragglers are removed except approved contract tests.
- Contract tests remain under `src/**` only.
- No contract tests exist under `embedded/**` or `plugin/**`.
- `bun run verify` passes without mutating files.
