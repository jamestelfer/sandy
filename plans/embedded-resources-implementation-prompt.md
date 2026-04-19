# Implementation prompt: embedded resources migration

Use this prompt to execute the feature against:

- `plans/embedded-resources-implementation-plan.md`
- `plans/embedded-resources-checklist.md`
- `plans/embedded-resources-initial-design-reference.md`

## Initial instructions (one-time)

1. Create a dedicated feature branch:
   - `git checkout -b feat/embedded-resources`
2. Confirm clean working tree before starting.
3. Follow the repository voice/style rules in `CLAUDE.md`.
4. Treat `src/mcp-resources/*` as migration source into `embedded/skills/mcp/resources/*`.

## Non-negotiable process rules

- Work in granular TDD increments only.
- For each increment:
  1. Write one focused failing test.
  2. Run the targeted test and capture the red result.
  3. Implement the minimum change.
  4. Run the targeted test and capture the green result.
- Do not batch multiple behavioural changes into one increment.
- Do not proceed without observed red and green states.

## Phase completion protocol (required before moving to next phase)

1. Confirm all phase acceptance criteria are met in `embedded-resources-checklist.md`.
2. Run `bun run agent` and require a full pass.
3. Review implementation for code quality and criteria coverage.
4. Check off the phase review sign-off item.
5. Commit progress with a conventional commit message.

## Commit requirements

- Use conventional commit format: `<type>(<scope>): <summary>`
- Suggested scopes: `embedded`, `mcp`, `cli`, `build`, `docs`, `tests`
- Examples:
  - `feat(embedded): add embedded skill directory structure`
  - `test(mcp): cover embedded resource loading paths`
  - `feat(cli): add sandy resource and sandy prime commands`

## Execution order

Implement phases strictly in checklist order:

1. Content layout and migration
2. Build tar packaging
3. Embedded FS runtime loader
4. MCP resource refactor
5. CLI resource/prime commands
6. MCP prime tool
7. Docs and cleanup

## Progress recording

At each phase boundary, record:

- tests added/updated
- red test command + result
- green test command + result
- `bun run agent` command + result
- commit hash and message
- checklist/sign-off status

## Done definition

Feature is complete only when all are true:

- Every checklist acceptance criterion is checked.
- Every phase review sign-off is checked.
- Every phase has at least one conventional commit.
- `bun run agent` passes at each phase boundary and at final state.
