# Plan: Sandy PRD Remaining Requirements

> Source PRD: plans/prd-sandy-rewrite.md
> Gaps: Req 5 (outputFiles), Req 6 (progress() helper), Req 37 (--output-dir flag)

## Context

Three PRD requirements remain unimplemented. All are small and independent — delivered in a single phase.

---

## Architectural decisions

- `outputFiles` entries are **relative paths** from `opts.sessionDir` — callers already hold the session dir
- `progress()` is imported via **relative path** from within scripts: `import { progress } from "../sandy.js"`
- `sandy.ts` lives at `/workspace/sandy.ts` inside the VM/container; compiles to `/workspace/dist/sandy.js` via the existing tsconfig
- `--output-dir` overrides the auto-generated `.sandy/<name>/` path but the session name is still generated (for MCP session tracking)

---

## Phase 1: Complete the three open PRD requirements

**Requirements addressed**: Req 5, Req 6, Req 37

### What to build

**Req 6 — `progress()` bootstrap helper**

A new file `src/bootstrap/sandy.ts`:
```ts
export function progress(message: string): void {
  process.stdout.write(`[--> ${message}\n`)
}
```

Wired in via:
- `src/bootstrap/init.sh` — `workspace()` step copies `sandy.ts` to `/workspace/`
- `src/bootstrap/tsconfig.json` — add `"sandy.ts"` to `"include"` so tsc compiles it alongside scripts
- Both `src/shuru-backend.ts` and `src/docker-backend.ts` — add an embed import and include `sandy.ts` in the `copyEmbedded` list for the staging directory

Scripts import it as:
```ts
import { progress } from "../sandy.js"
```

**Req 37 — `--output-dir` CLI flag**

In `src/cli/run.ts`:
- Add `outputDir?: string` to `RunArgs`
- Add `.option("output-dir", { type: "string" })` to the yargs builder

In `src/session.ts`, change `createSession` to accept an optional `dir` override:
```ts
export async function createSession(name?: string, dir?: string): Promise<Session>
```
If `dir` is provided, use it directly instead of the auto-generated `.sandy/<name>/` path. The session `name` is still generated (used by MCP for resume).

`src/cli/run.ts` passes `argv.outputDir` as the second arg to `createSession`.

**Req 5 — Populate `outputFiles`**

After each backend's `run()` completes (before `return`), scan `opts.sessionDir`:
```ts
import { readdirSync } from "node:fs"

const outputFiles = readdirSync(opts.sessionDir, { recursive: true })
  .filter((f) => typeof f === "string")
  .map((f) => f as string)
```

Both `src/docker-backend.ts` (line 233) and `src/shuru-backend.ts` (line 209) need this change. If `sessionDir` doesn't exist yet (no files written), return `[]` without throwing.

### Acceptance criteria

- [ ] `import { progress } from "../sandy.js"` resolves in a script inside `/workspace/scripts/`; calling it writes `[--> message\n` to stdout which surfaces as a progress notification
- [ ] `sandy run --script foo.ts --imds-port 2773 --output-dir /tmp/my-out` uses `/tmp/my-out` as the session directory instead of `.sandy/<name>/`
- [ ] After a script that writes a file to `$SANDY_OUTPUT/result.json`, `RunResult.outputFiles` contains `"result.json"`
- [ ] `bun test` passes
- [ ] `bun run build` succeeds (binary compiles with embedded `sandy.ts`)

---

## Verification

```bash
bun test                  # all unit tests green
bun run lint              # no lint errors
bun run build             # binary compiles

# Integration (requires Docker):
INTEGRATION=true bun test src/docker-backend.integration.test.ts
```

For `outputFiles`, add a test case to `docker-backend.integration.test.ts` (or a unit test with DummyBackend verifying the scan path is called) that asserts a non-empty `outputFiles` when a script writes to `$SANDY_OUTPUT`.

For `--output-dir`, add a test in `src/cli.test.ts` or a new `run.test.ts` verifying the flag is accepted and passed to `createSession`.
