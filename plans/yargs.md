# Plan: Migrate Sandy CLI to yargs

## Context

Sandy's CLI handlers do manual argument parsing via string array iteration. This means each file
has boilerplate loops to extract flags, manual type coercion, and manual required-flag validation.
Migrating to yargs removes all that boilerplate, provides structured help output, and gives typed
`argv` objects to handlers. The goal is cleaner, more maintainable CLI code — not a behavioural
change.

---

## Step 1: Add dependencies

```
bun add yargs
bun add -d @types/yargs
```

---

## Step 2: Refactor `src/cli/config.ts`

Change `runConfig(args: string[], ...)` → `runConfig(argv: ConfigArgs, ...)`.
Export a default `CommandModule` (no backend needed, so no factory required).

```typescript
interface ConfigArgs { docker: boolean; shuru: boolean }

export async function runConfig(
  argv: ConfigArgs,
  print: (line: string) => void = console.log,
): Promise<void> { ... }  // return void; errors use process.exit

const configCommand: CommandModule = {
  command: "config",
  describe: "Show or set the backend",
  builder: (y) =>
    y.option("docker", { type: "boolean", default: false })
     .option("shuru",  { type: "boolean", default: false })
     .conflicts("docker", "shuru"),
  handler: async (argv) => runConfig(argv as ConfigArgs),
}
export default configCommand
```

---

## Step 3: Refactor `src/cli/image.ts`

Change `runImage(args: string[], backend, ...)` → `runImage(argv: ImageArgs, backend, ...)`.
Return a factory `makeImageCommand(backend)` that produces a `CommandModule`.
Use `command: ["image <action>", "snapshot <action>"]` to handle the `snapshot` alias — this
eliminates `src/cli/snapshot.ts`.

```typescript
interface ImageArgs { action: "create" | "delete" }

export async function runImage(argv: ImageArgs, backend: Backend, ...): Promise<void>

export function makeImageCommand(backend: Backend): CommandModule {
  return {
    command: ["image <action>", "snapshot <action>"],
    builder: (y) => y.positional("action", { choices: ["create", "delete"], demandOption: true }),
    handler: async (argv) => runImage(argv as ImageArgs, backend),
  }
}
```

---

## Step 4: Refactor `src/cli/check.ts`

Split into two exported functions `runBaseline(backend, ...)` and
`runConnect(argv: ConnectArgs, backend, ...)`. Export a factory `makeCheckCommand(backend)` using
nested yargs commands.

```typescript
interface ConnectArgs { imdsPort: number; region: string }

export async function runBaseline(backend: Backend, ...): Promise<void>
export async function runConnect(argv: ConnectArgs, backend: Backend, ...): Promise<void>

export function makeCheckCommand(backend: Backend): CommandModule {
  return {
    command: "check",
    builder: (y) =>
      y.command("baseline", "...", {}, async () => runBaseline(backend))
       .command("connect",  "...",
         (y) => y.option("imds-port", { type: "number", demandOption: true })
                  .option("region",   { type: "string",  default: DEFAULT_REGION }),
         async (argv) => runConnect(argv as ConnectArgs, backend))
       .demandCommand(1),
    handler: () => {},
  }
}
```

---

## Step 5: Refactor `src/cli/run.ts`

Change `runRun(args: string[], backend, ...)` → `runRun(argv: RunArgs, backend, ...)`.
Use `.parserConfiguration({ "populate--": true })` so that args after `--` land in `argv["--"]`.

```typescript
interface RunArgs {
  script: string
  imdsPort: number
  region: string
  session?: string
  "--"?: string[]
}

export async function runRun(argv: RunArgs, backend: Backend, ...): Promise<void>

export function makeRunCommand(backend: Backend): CommandModule {
  return {
    command: "run",
    builder: (y) =>
      y.option("script",    { type: "string", demandOption: true })
       .option("imds-port", { type: "number", demandOption: true })
       .option("region",    { type: "string", default: DEFAULT_REGION })
       .option("session",   { type: "string" })
       .parserConfiguration({ "populate--": true }),
    handler: async (argv) => runRun(argv as RunArgs, backend),
  }
}
```

Note: yargs auto-camelCases `--imds-port` → `argv.imdsPort`.

---

## Step 6: Refactor `src/cli/mcp.ts`

Change return type to `Promise<void>`. Export `makeMcpCommand(backend)`.

---

## Step 7: Rewrite `src/main.ts`

```typescript
import { hideBin } from "yargs/helpers"
import yargs from "yargs"

async function main(): Promise<void> {
  const backend = await createBackend()   // eager — constructors are lightweight

  await yargs(hideBin(process.argv))
    .scriptName("sandy")
    .command(configCommand)
    .command(makeImageCommand(backend))
    .command(makeCheckCommand(backend))
    .command(makeRunCommand(backend))
    .command(makeMcpCommand(backend))
    .demandCommand(1, "Specify a command")
    .strict()
    .help()
    .parseAsync()
}
```

Remove: the manual `usage()` function, the dispatch switch, and the `snapshot` routing (now an
alias in `makeImageCommand`).

---

## Step 8: Delete `src/cli/snapshot.ts`

The snapshot alias is now handled by `command: ["image <action>", "snapshot <action>"]` in
`makeImageCommand`. The file is no longer needed.

---

## Step 9: Update `src/cli.test.ts`

Change all calls to pass typed objects instead of string arrays:

| Before | After |
|---|---|
| `runConfig([], print)` | `runConfig({ docker: false, shuru: false }, print)` |
| `runConfig(["--docker"], print)` | `runConfig({ docker: true, shuru: false }, print)` |
| `runImage(["create"], backend)` | `runImage({ action: "create" }, backend)` |
| `runSnapshot(["create"], backend)` | `runImage({ action: "create" }, backend)` (import `runImage`) |
| `runCheck(["baseline"], backend)` | `runBaseline(backend)` |
| `runCheck(["connect", "--imds-port", "9001"], backend)` | `runConnect({ imdsPort: 9001, region: DEFAULT_REGION }, backend)` |
| `runRun(["--script", "foo.ts", "--imds-port", "9001"], backend)` | `runRun({ script: "foo.ts", imdsPort: 9001, region: DEFAULT_REGION }, backend)` |

**Remove** the "missing required flag" tests for `check connect` and `run` — yargs enforces
`demandOption` itself before handlers are called. These tests are no longer meaningful at the unit
level. Keep the test that verifies dispatching to `backend.run()` with correct options.

The `CLI snapshot` describe block becomes unnecessary; merge into `CLI image` or drop entirely
since the alias is now a yargs concern, not a logic concern.

---

## Critical files

- `src/main.ts` — full rewrite
- `src/cli/config.ts` — signature change + CommandModule export
- `src/cli/image.ts` — signature change + factory, handles snapshot alias
- `src/cli/check.ts` — split into runBaseline/runConnect + factory
- `src/cli/run.ts` — signature change + factory
- `src/cli/mcp.ts` — minor signature change + factory
- `src/cli/snapshot.ts` — **delete**
- `src/cli.test.ts` — update all call sites, remove demandOption tests
- `package.json` — add yargs + @types/yargs

---

## Verification

```bash
bun run agent           # lint:fix + format:fix + build + test — must all pass

# Smoke test the built binary:
dist/sandy --help
dist/sandy config
dist/sandy config --docker
dist/sandy config --shuru
dist/sandy image --help
dist/sandy check --help
dist/sandy run --help
dist/sandy snapshot create   # should still work (alias)
dist/sandy run --script nonexistent.ts --imds-port 9001   # should attempt run
dist/sandy check connect     # should error: missing --imds-port
```
