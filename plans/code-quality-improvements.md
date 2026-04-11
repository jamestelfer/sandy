# Plan: Code Quality Improvements

> Source: Issues identified during session retrospective and code review, 2026-04-12.

## Architectural decisions

- `ProgressCallback` is the canonical shared type — lives in `src/types.ts`, imported everywhere else
- `OutputHandler` is the single routing point for all output in both CLI and MCP paths — no direct `process.stderr.write` in handler code, no duplicate routing
- Test fakes are factory functions returning typed interfaces, not classes — pattern should be consistent across both backends

---

## Phase 1: Mechanical fixes

### What to build

Fix four issues that are low-risk, require no behavioural reasoning, and are verifiable by `bun run agent` passing cleanly with no lint warnings.

### Acceptance criteria

- [ ] Biome lint warning resolved: unused `message` parameter in no-op callback renamed to `_message` (`mcp-server.ts:108`)
- [ ] `DOCKERFILE_ENV` formatting fixed: first entry has no leading spaces relative to `ENV` keyword — subsequent entries retain continuation indent
- [ ] `ProgressCallback` type removed from `mcp-server.ts`; all references in that file import from `./types`
- [ ] Unnecessary wrapper lambda in `SandyMcpServer.handleSandyRun` replaced: `onProgress ?? (() => {})` passed directly to `backend.run()`
- [ ] `bun run agent` passes with zero lint warnings

---

## Phase 2: Behavioural correctness

### What to build

Fix three issues where the current code has a latent bug or inconsistency that could produce incorrect runtime behaviour. Each requires a test to document the correct behaviour before the fix.

**`resumedName` not cleared after use (`mcp-server.ts`)**
After `ensureSession()` creates a session using `resumedName`, the field should be cleared so a later `handleResumeSession` + session reset cycle doesn't unexpectedly reuse the old name. Add a test asserting that a second resume + run uses the new session name, not the first.

**`imageCreate` double-reject (`docker-backend.ts`)**
The stream `data` handler calls `reject` on build errors but does not guard against subsequent data events after rejection. Wrap with a `rejected` flag or use `once` for the error path. Add a test with a build stream that emits an error frame followed by more data and asserts the promise rejects exactly once.

**`cli/run.ts` OutputHandler inconsistency**
`runRun` creates an `OutputHandler` to route the "output directory" message to stderr, but then passes `onProgress` directly to `backend.run()` bypassing the handler. Either route all output through the handler or eliminate the handler and write the message directly. Add or update a test that verifies the output directory message reaches stderr without `[err]` prefix (test already exists; it should continue to pass after refactor).

### Acceptance criteria

- [ ] Test: calling `handleResumeSession("a")` then `handleSandyRun`, then `handleResumeSession("b")` and clearing `activeSession` results in the next `handleSandyRun` using session `"b"`, not `"a"`
- [ ] `resumedName` is set to `null` after `ensureSession` consumes it
- [ ] Test: `imageCreate` with a build stream that emits `{ error: "..." }` followed by additional data rejects the returned promise exactly once
- [ ] `imageCreate` guards `reject` against being called more than once
- [ ] `runRun` either routes the output directory message through `OutputHandler` consistently with all other output, or removes the handler and writes directly — no split routing
- [ ] `bun run agent` passes

---

## Phase 3: Test infrastructure

### What to build

Improve test quality without changing production behaviour. Two independent concerns.

**Netskope cert message suppression**
`stageBootstrapFiles` writes to `process.stderr` unconditionally, so every unit test run that calls it (directly or via bootstrap-staging tests) emits `sandy: Netskope certificate not found, skipping`. This is noise that obscures real failures. Accept an optional `logger` parameter (defaulting to `process.stderr.write`) and pass a no-op in tests, or check an environment variable to suppress in test context. The message must still appear in real use.

**Test fake builder unification**
`docker-backend.test.ts` and `shuru-backend.test.ts` each define their own factory pattern for fake backends. If a third backend is added, a third pattern would be invented. Extract shared fake construction utilities (typed interfaces, common builder shape) into a test helper file, and update both test files to use it. No production code changes.

### Acceptance criteria

- [ ] `bun test` output contains no `sandy: Netskope certificate not found` lines
- [ ] Real invocation of `sandy image create` still logs the Netskope message when the cert is absent
- [ ] Shared fake builder utilities extracted to a test helper (e.g. `src/test-helpers.ts` or similar)
- [ ] `docker-backend.test.ts` and `shuru-backend.test.ts` use the shared helpers for their container/sandbox fakes
- [ ] All existing tests continue to pass unchanged
- [ ] `bun run agent` passes
