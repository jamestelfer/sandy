# Embedded resources implementation plan

## Goal

Move Sandy resource and skill content to an embedded filesystem model backed by `embedded.tar`, and serve it consistently via CLI and MCP.

## Scope

- Introduce `embedded/skills/cli` and `embedded/skills/mcp` trees.
- Pack `embedded/` into `embedded.tar` at build time.
- Load embedded tar into memfs lazily at runtime.
- Add CLI commands:
  - `sandy resource`
  - `sandy resource <sandy://...>`
  - `sandy prime`
- Refactor MCP resource serving to use embedded content.
- Add MCP `prime` tool for MCP-flavoured SKILL.md.
- Migrate existing `src/mcp-resources/*` into `embedded/skills/mcp/resources/*`.

## Out of scope

- Cross-skill deduplication via symlinks.
- New resource authoring UX beyond existing CLI/MCP interfaces.
- Backward-compatibility shims for legacy URI shapes unless required by tests.

## Target structure

```text
embedded/
  skills/
    cli/
      SKILL.md
      resources/
        examples.md
        examples/
          ec2_describe.ts
          ecs_services.ts
    mcp/
      SKILL.md
      resources/
        examples.md
        examples/
          ec2_describe.ts
          ecs_services.ts
```

## Execution discipline

- Create and use a dedicated feature branch before implementation starts.
- Execute work in granular red/green/refactor increments.
- For each completed phase:
  - run focused tests used in the red/green cycle
  - run `bun run agent` and require pass
  - commit with a conventional commit message
  - complete review sign-off in the checklist

## Implementation phases

### 1) Content migration and layout

- Create the `embedded/` directory tree.
- Move current `src/mcp-resources/scripting-guide.md` and examples into `embedded/skills/mcp/resources/`.
- Create CLI mirror in `embedded/skills/cli/resources/`.
- Add both SKILL.md variants:
  - CLI links use `sandy resource sandy://...`
  - MCP links use direct `sandy://...`

### 2) Build packaging

- Add `scripts/pack-embedded.ts` using `tar-fs`.
- Pack `embedded/` to `embedded.tar`.
- Wire `package.json` prebuild hook.
- Add required dependencies (`tar-fs`, `memfs`).

### 3) Runtime embedded FS module

- Add `src/embedded-fs.ts`.
- Import `embedded.tar` with Bun file embedding:
  - `import tarPath from "../embedded.tar" with { type: "file" }`
- Lazily extract tar to memfs once.
- Expose helpers:
  - list resource URIs
  - read resource by URI
  - map URI <-> internal path
  - validate URI scheme

### 4) CLI command integration

- Add `src/cli/resource.ts`.
- Add `src/cli/prime.ts`.
- Register commands in `src/main.ts`.
- `resource` command behaviours:
  - no arg: list all resources as JSON
  - URI arg: print content or fail non-zero
- `prime`: print `embedded/skills/cli/SKILL.md`

### 5) MCP refactor and prime tool

- Refactor `src/mcp-server.ts` to read resources from embedded FS.
- Remove hardcoded file imports from `src/mcp-resources/*`.
- Register resources from embedded path inventory.
- Add `prime` tool returning `embedded/skills/mcp/SKILL.md` content.

### 6) Test updates

- Add `src/embedded-fs.test.ts`.
- Extend `src/cli.test.ts` for `resource` and `prime`.
- Update `src/mcp-server.test.ts` to assert embedded-backed resources and `prime` tool.
- Add consistency tests for CLI vs MCP SKILL link styles.

### 7) Documentation and cleanup

- Update README usage for new commands and URI scheme.
- Remove legacy `src/mcp-resources/*` after migration is verified.
- Ensure no stale references remain.

## Risks and controls

- Risk: resource drift between CLI and MCP trees.
  - Control: add consistency checks in tests.
- Risk: runtime extraction race conditions.
  - Control: single memoised initialisation promise.
- Risk: command behaviour regressions.
  - Control: focused CLI and MCP regression coverage.

## Completion criteria

- All checklist items in `plans/embedded-resources-checklist.md` are checked.
- Every phase has a review sign-off entry marked complete.
- Every phase has a conventional commit recorded.
- `bun run agent` passes at each phase boundary.
- Final `bun run agent` pass is recorded at feature completion.
