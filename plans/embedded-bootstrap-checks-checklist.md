# Embedded bootstrap/check resources checklist

## Process gate for every segment

Complete all steps before moving forward:

1. Add or update one focused test.
2. Run the targeted test and observe failure (red).
3. Implement the minimal code change.
4. Run the targeted test and observe pass (green).
5. Run the relevant suite for regression.
6. Run `bun run agent` and observe pass.
7. Commit the phase increment with a conventional commit message.
8. Record pass/fail evidence in notes.

## Global execution criteria

- [x] Work proceeds on a dedicated feature branch.
- [x] Every phase completion includes a passing `bun run agent` run.
- [x] Every phase completion is committed with a conventional commit message.
- [x] No phase advances without review sign-off.

---

## Phase 1 — Canonical skill contract and sync strategy

### Acceptance criteria
- [x] `embedded/skills/mcp/SKILL.md` is initialised from current `plugin/skills/sandy/SKILL.md`
- [x] `embedded/skills/mcp/SKILL.md` is declared canonical for MCP skill content
- [x] Sync mechanism is a test asserting content equality (not a build-time copy step)
- [x] Divergence test exists and fails on mismatch
- [x] Plugin packaging path remains functional

### Review sign-off
- [x] **Phase 1 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 2 — Embedded bootstrap/check layout

### Acceptance criteria
- [x] Bootstrap files are represented under `embedded/` with stable paths
- [x] Baseline/connect check scripts are represented under `embedded/`
- [x] Layout tests assert required files are present
- [x] Runtime behaviour is unchanged before consumer refactors

### Review sign-off
- [x] **Phase 2 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 3 — Embedded FS recursive copy support

### Acceptance criteria
- [x] Embedded FS provides a generic recursive fs→fs directory copy operation
- [x] Recursive copy tests verify byte-for-byte content copy
- [x] Missing source handling is explicit and tested
- [x] Operation naming is behaviour-based (no "helper"/"utility" names)

### Review sign-off
- [x] **Phase 3 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 4 — Bootstrap staging refactor

### Acceptance criteria
- [x] `stageBootstrapFiles` sources bootstrap files via the recursive fs→fs copy operation
- [x] Existing staged bootstrap file set is preserved
- [x] Netskope certificate handling is unchanged (host-path copy, not embedded)
- [x] Bootstrap staging tests pass
- [x] Original `src/bootstrap/*` source files are deleted

### Review sign-off
- [x] **Phase 4 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 5 — Check script resolver refactor

### Acceptance criteria
- [x] `resolveScriptDir` sources baseline/connect scripts via embedded FS
- [x] Baseline/connect temp-file naming and disposal behaviour are preserved
- [x] Check script tests pass
- [x] CLI/MCP check flows remain unchanged
- [x] Original `src/checks/*` source files are deleted

### Review sign-off
- [x] **Phase 5 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 6 — Cleanup and documentation alignment

### Acceptance criteria
- [x] Legacy direct embedding pathways superseded by embedded FS are removed
- [x] README/docs describe canonical skill source and sync expectations
- [x] Tests assert no legacy path dependencies remain
- [x] Full test suite passes

### Review sign-off
- [x] **Phase 6 review completed**: code quality reviewed and all acceptance criteria verified
