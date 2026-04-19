# Embedded skills/bootstrap/checks design review (grill notes)

## Decision 1: Plugin SKILL source of truth

### Question
Should plugin skill content live only in `plugin/skills/sandy/SKILL.md`, only in `embedded/skills/mcp/SKILL.md`, or be maintained in both manually?

### Risks if unresolved
- Drift between what plugin ships and what MCP `prime` serves
- Repeated hotfixes for stale resource URIs
- Review burden on every doc change

### Recommended answer
Use `embedded/skills/mcp/SKILL.md` as the canonical source. Seed it by copying the current `plugin/skills/sandy/SKILL.md` content first, then keep `plugin/skills/sandy/SKILL.md` as a generated or synchronised artefact for plugin packaging compatibility.

### Guardrail
Add an automated sync check test that fails on divergence.

---

## Decision 2: Plugin metadata placement

### Question
Should plugin metadata files move into `embedded/` with skills?

### Risks if moved
- Breaks plugin packaging assumptions
- Conflates runtime resource payload with plugin manifest concerns

### Recommended answer
Keep plugin manifests in `plugin/.claude-plugin/`. Only skill content and runtime resources belong in `embedded/`.

---

## Decision 3: Bootstrap and check script embedding

### Question
Should `src/bootstrap/*` and `src/checks/*` remain Bun file imports or move into `embedded/`?

### Risks if split approach continues
- Two embedding systems with duplicate logic
- Inconsistent pathing and lifecycle for embedded assets
- Harder to reason about runtime extraction/copy semantics

### Recommended answer
Move bootstrap and check script payloads into `embedded/` and load through the same embedded FS abstraction.

---

## Decision 4: Runtime copy semantics

### Question
When backends need bootstrap/check files on disk, should they read direct strings or copy from memfs to temp dirs?

### Risks with ad-hoc reading
- Inconsistent file permissions and layout
- Duplicate write logic in multiple call sites

### Recommended answer
Implement a generic recursive fs→fs copy operation, named by behaviour (for example `copyDirectoryRecursive`), that accepts source and destination filesystem handles and directory paths. Bootstrap staging and check script materialisation should call this operation rather than bespoke per-flow copy code.

---

## Decision 5: Migration safety

### Question
How to prevent regressions while moving bootstrap/check sources?

### Recommended answer
Preserve existing integration surface and verify with focused tests:
- bootstrap staging tests verify all expected files staged
- check script resolver tests verify temp files created for baseline/connect
- full `bun run agent` gate at each phase boundary
