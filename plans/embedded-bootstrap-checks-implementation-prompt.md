# Implementation prompt: embedded bootstrap/check migration and skill source alignment

Use this prompt to execute the feature against:

- `plans/embedded-bootstrap-checks-grill-notes.md`
- `plans/embedded-bootstrap-checks-implementation-plan.md`
- `plans/embedded-bootstrap-checks-checklist.md`

## Initial instructions (one-time)

1. Work on the existing `feat/embedded-resources` branch (continuation of PR #9).
2. Confirm a clean working tree before implementation starts.
3. Follow repository rules in `CLAUDE.md`.
4. Treat the current plugin skill file as the source to seed canonical MCP skill content:
   - Copy `plugin/skills/sandy/SKILL.md` into `embedded/skills/mcp/SKILL.md` at Phase 1.
5. The Netskope certificate is a host-path copy and is explicitly excluded from embedded FS migration.
6. Original `src/bootstrap/*` and `src/checks/*` files are deleted after migration to `embedded/`.
7. The recursive fs→fs copy replaces the existing `Bun.file().arrayBuffer()` bunfs workaround. It must work in both dev (real disk tar) and compiled binary (embedded tar) modes.

## Non-negotiable process rules

- Work in granular TDD increments only.
- For each increment:
  1. Write one focused failing test.
  2. Run the targeted test and capture the red result.
  3. Implement the minimum change.
  4. Run the targeted test and capture the green result.
- Do not batch multiple behavioural changes in one increment.
- Do not continue without observed red and green states.

## Naming and design constraints

- Do not create `*Helper`, `*Helpers`, `*Util`, `*Utils`, or `utilities` modules/classes/functions.
- Filesystem operations must be named by behaviour and usage.
- Implement a generic recursive fs→fs directory copy operation (for example `copyDirectoryRecursive`).
- Use that operation for embedded resource materialisation (bootstrap/check consumers).

## Phase completion protocol (required before moving to next phase)

1. Confirm all phase acceptance criteria are checked in `embedded-bootstrap-checks-checklist.md`.
2. Run `bun run agent` and require a full pass.
3. Review implementation for code quality and criteria coverage.
4. Check off phase review sign-off.
5. Commit progress with a conventional commit message.

## Commit requirements

- Use conventional commit format: `<type>(<scope>): <summary>`
- Suggested scopes: `embedded`, `mcp`, `cli`, `build`, `bootstrap`, `checks`, `docs`, `tests`
- Example messages:
  - `feat(mcp): seed canonical embedded skill from plugin skill content`
  - `feat(embedded): add recursive fs to fs directory copy`
  - `refactor(bootstrap): source staged files from embedded filesystem copy`
  - `refactor(checks): load baseline and connect scripts from embedded resources`

## Execution order

Implement phases strictly in checklist order:

1. Canonical skill contract and sync strategy
2. Embedded bootstrap/check layout
3. Embedded FS recursive copy support
4. Bootstrap staging refactor
5. Check script resolver refactor
6. Cleanup and documentation alignment

## Progress recording

At each phase boundary, record:

- tests added/updated
- red test command + result
- green test command + result
- `bun run agent` command + result
- commit hash and message
- checklist and sign-off status

## Done definition

Feature is complete only when all are true:

- Every checklist acceptance criterion is checked.
- Every phase review sign-off is checked.
- Every phase has at least one conventional commit.
- `bun run agent` passes at each phase boundary and final state.
- `embedded/skills/mcp/SKILL.md` is canonical and plugin skill content remains synchronised.
- Bootstrap and check resource loading paths are routed through embedded FS copy operations.
