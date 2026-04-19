# Embedded resources implementation checklist

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

## Phase 1 — Introduce embedded content layout

### Acceptance criteria
- [x] `embedded/skills/mcp/resources/` contains migrated content from `src/mcp-resources/*`
- [x] `embedded/skills/cli/resources/` exists and duplicates shared resources intentionally
- [x] `embedded/skills/cli/SKILL.md` exists
- [x] `embedded/skills/mcp/SKILL.md` exists
- [x] Tests assert required files exist in both trees

### Review sign-off
- [x] **Phase 1 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 2 — Add tar packaging step

### Acceptance criteria
- [ ] `scripts/pack-embedded.ts` packs `embedded/` into `embedded.tar`
- [ ] `package.json` includes automatic pack step before build
- [ ] Dependencies required for pack/extract are declared
- [ ] Tests verify tar contains expected key paths (`skills/cli/SKILL.md`, `skills/mcp/SKILL.md`)

### Review sign-off
- [ ] **Phase 2 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 3 — Implement embedded filesystem loader

### Acceptance criteria
- [ ] `src/embedded-fs.ts` loads `embedded.tar` via Bun file embedding
- [ ] Initialisation is lazy and memoised
- [ ] Concurrent initialisation calls share one promise
- [ ] API supports listing resources as `sandy://` URIs
- [ ] API supports reading resource text by URI/path
- [ ] Invalid URI handling is tested and deterministic

### Review sign-off
- [ ] **Phase 3 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 4 — Refactor MCP resources to embedded FS

### Acceptance criteria
- [ ] `src/mcp-server.ts` serves resources from embedded FS
- [ ] Resource registration uses embedded path mapping
- [ ] Existing `sandy_*` tool behaviour remains intact
- [ ] MCP resource tests pass against new structure
- [ ] Legacy static imports from `src/mcp-resources/*` removed

### Review sign-off
- [ ] **Phase 4 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 5 — Add CLI `resource` and `prime` commands

### Acceptance criteria
- [ ] `sandy resource` lists all embedded resource URIs as JSON
- [ ] `sandy resource sandy://...` prints exact resource content
- [ ] Invalid/missing resource path returns failure state
- [ ] `sandy prime` prints `embedded/skills/cli/SKILL.md`
- [ ] Commands are wired in `src/main.ts`
- [ ] CLI tests cover list/read/prime/error flows

### Review sign-off
- [ ] **Phase 5 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 6 — Add MCP `prime` tool

### Acceptance criteria
- [ ] MCP registers `prime` tool
- [ ] `prime` returns exact contents of `embedded/skills/mcp/SKILL.md`
- [ ] MCP tests cover tool registration and response content

### Review sign-off
- [ ] **Phase 6 review completed**: code quality reviewed and all acceptance criteria verified

---

## Phase 7 — Documentation and clean-up

### Acceptance criteria
- [ ] README documents `sandy resource` and `sandy prime`
- [ ] Skill/resource URI references align with new embedded structure
- [ ] Obsolete `src/mcp-resources/*` files removed after migration
- [ ] Full test suite passes

### Review sign-off
- [ ] **Phase 7 review completed**: code quality reviewed and all acceptance criteria verified
