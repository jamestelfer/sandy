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

- [ ] Work proceeds on a dedicated feature branch.
- [ ] Every phase completion includes a passing `bun run agent` run.
- [ ] Every phase completion is committed with a conventional commit message.
- [ ] No phase advances without review sign-off.

---

## Phase 1 — Canonical skill contract and sync strategy

### Acceptance criteria
- [ ] `embedded/skills/mcp/SKILL.md` is initialised from current `plugin/skills/sandy/SKILL.md`
- [ ] `embedded/skills/mcp/SKILL.md` is declared canonical for MCP skill content
- [ ] Sync mechanism is a test asserting content equality (not a build-time copy step)
- [ ] Divergence test exists and fails on mismatch
- [ ] Plugin packaging path remains functional

### Review sign-off
- [ ] **Phase 1 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 2 — Embedded bootstrap/check layout

### Acceptance criteria
- [ ] Bootstrap files are represented under `embedded/` with stable paths
- [ ] Baseline/connect check scripts are represented under `embedded/`
- [ ] Layout tests assert required files are present
- [ ] Runtime behaviour is unchanged before consumer refactors

### Review sign-off
- [ ] **Phase 2 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 3 — Embedded FS recursive copy support

### Acceptance criteria
- [ ] Embedded FS provides a generic recursive fs→fs directory copy operation
- [ ] Recursive copy tests verify byte-for-byte content copy
- [ ] Missing source handling is explicit and tested
- [ ] Operation naming is behaviour-based (no "helper"/"utility" names)

### Review sign-off
- [ ] **Phase 3 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 4 — Bootstrap staging refactor

### Acceptance criteria
- [ ] `stageBootstrapFiles` sources bootstrap files via the recursive fs→fs copy operation
- [ ] Existing staged bootstrap file set is preserved
- [ ] Netskope certificate handling is unchanged (host-path copy, not embedded)
- [ ] Bootstrap staging tests pass
- [ ] Original `src/bootstrap/*` source files are deleted

### Review sign-off
- [ ] **Phase 4 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 5 — Check script resolver refactor

### Acceptance criteria
- [ ] `resolveScriptDir` sources baseline/connect scripts via embedded FS
- [ ] Baseline/connect temp-file naming and disposal behaviour are preserved
- [ ] Check script tests pass
- [ ] CLI/MCP check flows remain unchanged
- [ ] Original `src/checks/*` source files are deleted

### Review sign-off
- [ ] **Phase 5 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 6 — Cleanup and documentation alignment

### Acceptance criteria
- [ ] Legacy direct embedding pathways superseded by embedded FS are removed
- [ ] README/docs describe canonical skill source and sync expectations
- [ ] Tests assert no legacy path dependencies remain
- [ ] Full test suite passes

### Review sign-off
- [ ] **Phase 6 review completed**: code quality reviewed and all acceptance criteria verified
