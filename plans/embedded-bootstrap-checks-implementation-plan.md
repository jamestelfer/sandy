# Plan: Embedded bootstrap/check resources and plugin skill synchronisation

> Source context: continuation of embedded resources migration (PR #9, branch `feat/embedded-resources`)

## Architectural decisions

Durable decisions that apply across all phases:

- **Skill source of truth**: `embedded/skills/mcp/SKILL.md` is canonical for MCP skill content.
- **Plugin compatibility**: `plugin/skills/sandy/SKILL.md` remains, synchronised from canonical content.
- **Embedded payload scope**: bootstrap files and check scripts move under `embedded/` and are loaded via embedded FS.
- **Runtime materialisation**: components that require filesystem paths copy files from memfs to temp destinations via a generic recursive fs→fs copy. This replaces the current `Bun.file().arrayBuffer()` workaround for bunfs paths.
- **Netskope certificate**: remains a host-path copy from `/Library/Application Support/Netskope/...`. It is not an embedded resource and is excluded from the embedded FS migration.
- **Source file removal**: `src/bootstrap/*` and `src/checks/*` source files are deleted after their content moves to `embedded/`. The originals do not remain.
- **Sync mechanism**: a test asserting content equality between `embedded/skills/mcp/SKILL.md` and `plugin/skills/sandy/SKILL.md`. Not a build-time copy step.

## Execution discipline

- Implement only in granular red/green/refactor increments.
- For each completed phase:
  - run focused tests used in the red/green cycle
  - run `bun run agent` and require pass
  - commit with a conventional commit message
  - mark checklist acceptance and review sign-off

---

## Phase 1: Canonical skill contract and sync strategy

**User stories**: Keep plugin skill and embedded MCP skill consistent without manual drift.

### What to build

Define and enforce a single-source-of-truth contract for MCP skill content and plugin skill distribution. First copy the current `plugin/skills/sandy/SKILL.md` into `embedded/skills/mcp/SKILL.md` to establish the canonical baseline.

### Acceptance criteria

- [ ] `embedded/skills/mcp/SKILL.md` is initialised from current `plugin/skills/sandy/SKILL.md` content.
- [ ] `embedded/skills/mcp/SKILL.md` is documented as canonical source.
- [ ] Synchronisation mechanism is a test asserting content equality (not a build-time copy step).
- [ ] Test fails when canonical and plugin skill files diverge.
- [ ] Plugin skill can still be packaged from `plugin/skills/sandy/SKILL.md`.

### Verification

Run skill sync tests, then run `bun run agent`.

---

## Phase 2: Add embedded bootstrap/check resource layout

**User stories**: Use one embedded asset system for runtime resources.

### What to build

Create embedded directories for bootstrap and check assets and migrate existing file content.

### Acceptance criteria

- [ ] Bootstrap resources are present under `embedded/` with clear path conventions.
- [ ] Baseline and connect check scripts are present under `embedded/`.
- [ ] Migration tests validate required embedded files exist.
- [ ] No behavioural change introduced yet in runtime consumers.

### Verification

Run new layout tests and existing bootstrap/check tests, then `bun run agent`.

---

## Phase 3: Extend embedded FS for recursive fs→fs directory copy

**User stories**: Consumers can materialise embedded files onto disk safely.

### What to build

Add a generic recursive fs→fs directory copy operation for copying embedded resources from memfs into destination filesystems/directories.

### Acceptance criteria

- [ ] Embedded FS exposes a generic recursive fs→fs directory copy operation (for example `copyDirectoryRecursive`).
- [ ] Operation naming reflects behaviour and usage (no "helper" or "utility" naming).
- [ ] Recursive copy preserves file content exactly.
- [ ] Missing source path behaviour is explicit and tested.

### Verification

Run embedded FS tests including copy semantics, then `bun run agent`.

---

## Phase 4: Refactor bootstrap staging to embedded FS

**User stories**: Bootstrap staging uses canonical embedded resources, not direct Bun file imports.

### What to build

Update bootstrap staging flow to copy bootstrap files from embedded FS into backend staging dirs.

### Acceptance criteria

- [ ] `stageBootstrapFiles` sources files via the recursive fs→fs directory copy operation.
- [ ] Existing staged file set remains unchanged.
- [ ] Netskope certificate handling remains unchanged (host-path copy, not embedded).
- [ ] Bootstrap staging tests pass without legacy imports.
- [ ] Original `src/bootstrap/*` source files are deleted.

### Verification

Run bootstrap staging tests and backend tests that depend on staging, then `bun run agent`.

---

## Phase 5: Refactor check script resolution to embedded FS

**User stories**: Baseline/connect check scripts come from canonical embedded resources.

### What to build

Update check script resolver to load check scripts from embedded FS and materialise into temp dirs.

### Acceptance criteria

- [ ] `resolveScriptDir` uses embedded check script sources.
- [ ] `__baseline__` and `__connect__` behaviours remain unchanged.
- [ ] Temp directory lifecycle behaviour remains unchanged.
- [ ] Check script tests pass without legacy imports.
- [ ] Original `src/checks/*` source files are deleted.

### Verification

Run check script tests and CLI/MCP check flows, then `bun run agent`.

---

## Phase 6: Remove legacy resource pathways and align docs

**User stories**: Eliminate duplicate pathways and preserve maintainability.

### What to build

Remove obsolete direct-import pathways and update docs to reflect canonical resource ownership.

### Acceptance criteria

- [ ] Legacy bootstrap/check direct embedding paths removed where superseded.
- [ ] Documentation states canonical source and sync behaviour.
- [ ] Tests assert no legacy path dependencies remain.
- [ ] Full suite passes cleanly.

### Verification

Run targeted legacy-removal tests and full `bun run agent`.

## Completion criteria

- All checklist items are checked.
- Every phase has review sign-off.
- Every phase has a conventional commit.
- `bun run agent` passes at each phase boundary and final state.
