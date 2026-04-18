# MCP Pino Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured file-based logging to Sandy's MCP server using Pino, so diagnostic output (tool invocations, session lifecycle, backend errors, subprocess output) is captured in a log file instead of disappearing into Claude Code's stderr.

**Architecture:** Pino writes JSON log lines to `$XDG_STATE_HOME/sandy/mcp.log` (default `~/.local/state/sandy/mcp.log`) using `pino.destination()` with `sync: true` to avoid thread-stream worker resolution issues in Bun-compiled binaries. Log level is controlled via `SANDY_LOG_LEVEL` env var (default "info"). At debug level, raw subprocess output from OutputHandler is also logged. CLI commands use a silent (noop) logger — logging is MCP-only.

**Tech Stack:** Pino v10 (already declared in package.json, needs `bun install`), Bun test runner

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/logger.ts` | Create | XDG state dir resolution, `createLogger()`, `noopLogger()`, re-exports `Logger` type |
| `src/logger.test.ts` | Create | Tests for XDG resolution, logger file writing, noop behavior |
| `src/mcp-server.ts` | Modify | Accept logger in constructor, log tool lifecycle + session creation, OutputHandler debug hook |
| `src/mcp-server.test.ts` | Modify | Add logging describe block, verify log output from handler calls |
| `src/dummy-backend.ts` | Modify | Add `stdoutLines` field for non-progress output (needed to test debug hook) |
| `src/cli/mcp.ts` | Modify | Create real logger, pass to SandyMcpServer |
| `src/cli.test.ts` | Modify | Pass noopLogger to runMcp to avoid writing to real log path |

---

### Task 1: Logger module

**Files:**
- Create: `src/logger.ts`
- Create: `src/logger.test.ts`

- [ ] **Step 1: Install pino**

```bash
bun install
```

Expected: pino and dependencies installed into node_modules.

- [ ] **Step 2: Write failing tests for `stateDir`**

Create `src/logger.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { stateDir } from "./logger"

const tmpDir = join(import.meta.dir, "../.tmp-test-logger")

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true })
  process.env.XDG_STATE_HOME = tmpDir
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.XDG_STATE_HOME
})

describe("stateDir", () => {
  test("uses XDG_STATE_HOME when set", () => {
    expect(stateDir()).toBe(join(tmpDir, "sandy"))
  })

  test("falls back to ~/.local/state/sandy when XDG_STATE_HOME is unset", () => {
    delete process.env.XDG_STATE_HOME
    expect(stateDir()).toBe(join(homedir(), ".local", "state", "sandy"))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun test src/logger.test.ts
```

Expected: FAIL — `stateDir` is not exported from `./logger` (module doesn't exist).

- [ ] **Step 4: Implement `stateDir` in `src/logger.ts`**

Create `src/logger.ts`:

```ts
import { join } from "node:path"
import { homedir } from "node:os"

export function stateDir(): string {
  const xdg = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state")
  return join(xdg, "sandy")
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test src/logger.test.ts
```

Expected: PASS — both stateDir tests green.

- [ ] **Step 6: Write failing tests for `createLogger`**

Append to `src/logger.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { createLogger } from "./logger"

describe("createLogger", () => {
  test("writes JSON log lines to mcp.log in the state dir", () => {
    const logger = createLogger("info")
    logger.info("test message")

    const logFile = join(tmpDir, "sandy", "mcp.log")
    const content = readFileSync(logFile, "utf-8")
    const line = JSON.parse(content.trim())
    expect(line.msg).toBe("test message")
    expect(line.level).toBe(30)
  })

  test("creates the state directory if it does not exist", () => {
    rmSync(join(tmpDir, "sandy"), { recursive: true, force: true })
    const logger = createLogger()
    logger.info("init")

    const logFile = join(tmpDir, "sandy", "mcp.log")
    const content = readFileSync(logFile, "utf-8")
    expect(content).toContain("init")
  })

  test("reads level from SANDY_LOG_LEVEL env var when no argument given", () => {
    process.env.SANDY_LOG_LEVEL = "debug"
    try {
      const logger = createLogger()
      expect(logger.isLevelEnabled("debug")).toBe(true)
    } finally {
      delete process.env.SANDY_LOG_LEVEL
    }
  })
})
```

Note: the import of `readFileSync` merges with the existing `rmSync` import at the top of the file. The `createLogger` import merges with the `stateDir` import.

- [ ] **Step 7: Run test to verify it fails**

```bash
bun test src/logger.test.ts
```

Expected: FAIL — `createLogger` is not exported.

- [ ] **Step 8: Implement `createLogger`**

Add to `src/logger.ts`:

```ts
import pino from "pino"
import type { Logger } from "pino"
import { mkdirSync } from "node:fs"

export type { Logger }

export function createLogger(level?: string): Logger {
  const effectiveLevel = level ?? process.env.SANDY_LOG_LEVEL ?? "info"
  const dir = stateDir()
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, "mcp.log")
  return pino({ level: effectiveLevel }, pino.destination({ dest, sync: true }))
}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
bun test src/logger.test.ts
```

Expected: PASS — all createLogger tests green.

- [ ] **Step 10: Write failing test for `noopLogger`**

Append to `src/logger.test.ts`:

```ts
import { noopLogger } from "./logger"

describe("noopLogger", () => {
  test("returns a logger that does not throw", () => {
    const logger = noopLogger()
    expect(() => logger.info("ignored")).not.toThrow()
    expect(() => logger.debug({ key: "val" }, "ignored")).not.toThrow()
    expect(() => logger.error("ignored")).not.toThrow()
  })

  test("has all logging disabled", () => {
    const logger = noopLogger()
    expect(logger.isLevelEnabled("info")).toBe(false)
    expect(logger.isLevelEnabled("error")).toBe(false)
  })
})
```

- [ ] **Step 11: Run test to verify it fails**

```bash
bun test src/logger.test.ts
```

Expected: FAIL — `noopLogger` is not exported.

- [ ] **Step 12: Implement `noopLogger`**

Add to `src/logger.ts`:

```ts
export function noopLogger(): Logger {
  return pino({ level: "silent" })
}
```

- [ ] **Step 13: Run test to verify it passes**

```bash
bun test src/logger.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 14: Commit**

```bash
git add src/logger.ts src/logger.test.ts
git commit -m "feat: add Pino logger module with XDG state dir support"
```

---

### Task 2: MCP server accepts logger and logs tool lifecycle

**Files:**
- Modify: `src/mcp-server.ts` (constructor, handler methods, ensureSession)
- Modify: `src/mcp-server.test.ts` (new logging describe block)

- [ ] **Step 1: Write failing tests for tool handler logging**

Add these imports and describe block to the end of `src/mcp-server.test.ts`:

```ts
import pino from "pino"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

describe("logging", () => {
  const logDir = join(import.meta.dir, "../.tmp-test-mcp-log")

  function setup(level = "info") {
    mkdirSync(logDir, { recursive: true })
    const logFile = join(logDir, "test.log")
    const logger = pino({ level }, pino.destination({ dest: logFile, sync: true }))
    const backend = new DummyBackend()
    const server = new SandyMcpServer(backend, process.cwd(), logger)
    return {
      backend,
      server,
      logLines: (): Record<string, unknown>[] => {
        const content = readFileSync(logFile, "utf-8").trim()
        if (!content) return []
        return content.split("\n").map((l) => JSON.parse(l))
      },
    }
  }

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true })
  })

  test("handleSandyRun logs invocation and completion", async () => {
    const { server, logLines } = setup()
    await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

    const lines = logLines()
    expect(lines.some((l) => l.tool === "sandy_run" && l.msg === "invoked")).toBe(true)
    expect(lines.some((l) => l.tool === "sandy_run" && l.msg === "complete")).toBe(true)
  })

  test("handleSandyImage logs invocation and completion", async () => {
    const { server, logLines } = setup()
    await server.handleSandyImage(() => {}, "create")

    const lines = logLines()
    expect(lines.some((l) => l.tool === "sandy_image" && l.msg === "invoked")).toBe(true)
    expect(lines.some((l) => l.tool === "sandy_image" && l.msg === "complete")).toBe(true)
  })

  test("handleSandyCheck logs invocation and completion", async () => {
    const { backend, server, logLines } = setup()
    backend.imageExistsResult = true
    await server.handleSandyCheck(() => {}, "baseline")

    const lines = logLines()
    expect(lines.some((l) => l.tool === "sandy_check" && l.msg === "invoked")).toBe(true)
    expect(lines.some((l) => l.tool === "sandy_check" && l.msg === "complete")).toBe(true)
  })

  test("handleSandyCheck logs warning when no image found", async () => {
    const { server, logLines } = setup()
    await server.handleSandyCheck(() => {}, "baseline")

    const lines = logLines()
    expect(lines.some((l) => l.msg === "no image found" && l.level === 40)).toBe(true)
  })

  test("ensureSession logs session creation on first tool call", async () => {
    const { server, logLines } = setup()
    await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

    const lines = logLines()
    const sessionLog = lines.find((l) => l.msg === "session created")
    expect(sessionLog).toBeDefined()
    expect(sessionLog?.session).toBeTruthy()
  })

  test("handler error is logged before re-throwing", async () => {
    const { server, logLines } = setup()
    try {
      await server.handleSandyRun({ script: "/etc/shadow", imdsPort: 9001 })
    } catch {
      // expected
    }

    const lines = logLines()
    expect(lines.some((l) => l.tool === "sandy_run" && l.level === 50)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/mcp-server.test.ts
```

Expected: FAIL — SandyMcpServer constructor doesn't accept a third argument (tests still compile because extra args are ignored in JS, but no log output is produced so the assertions fail).

- [ ] **Step 3: Add logger parameter to SandyMcpServer constructor**

In `src/mcp-server.ts`, add imports:

```ts
import type { Logger } from "./logger"
import { noopLogger } from "./logger"
```

Change the constructor:

```ts
constructor(
  private backend: Backend,
  scriptsRoot: string = process.cwd(),
  private readonly logger: Logger = noopLogger(),
) {
  this.scriptsRoot = scriptsRoot
}
```

- [ ] **Step 4: Add logging to `handleSandyRun`**

Replace the `handleSandyRun` method body:

```ts
async handleSandyRun(
  params: SandyRunParams,
  onProgress?: ProgressCallback,
): Promise<SandyRunResult> {
  const log = this.logger.child({ tool: "sandy_run" })
  log.info({ script: params.script, region: params.region }, "invoked")
  try {
    this.validateScriptPath(params.script)
    const session = await this.ensureSession()

    const opts: RunOptions = {
      scriptPath: params.script,
      imdsPort: params.imdsPort,
      region: params.region ?? DEFAULT_REGION,
      session: session.name,
      sessionDir: session.dir,
      scriptArgs: params.args,
    }

    const handler = new OutputHandler(onProgress ?? (() => {}))
    const result = await this.backend.run(opts, handler)

    log.info({ exitCode: result.exitCode, session: session.name }, "complete")
    return {
      exitCode: result.exitCode,
      output: result.output,
      sessionName: session.name,
    }
  } catch (err) {
    log.error({ err }, "failed")
    throw err
  }
}
```

- [ ] **Step 5: Add logging to `handleSandyImage`**

Replace the `handleSandyImage` method body:

```ts
async handleSandyImage(
  onProgress: ProgressCallback,
  action: "create" | "delete",
  force?: boolean,
): Promise<void> {
  const log = this.logger.child({ tool: "sandy_image" })
  log.info({ action, force }, "invoked")
  try {
    const handler = new OutputHandler(onProgress)
    if (action === "create") {
      await this.backend.imageCreate(handler)
    } else {
      await this.backend.imageDelete(handler, force)
    }
    log.info({ action }, "complete")
  } catch (err) {
    log.error({ err }, "failed")
    throw err
  }
}
```

- [ ] **Step 6: Add logging to `handleSandyCheck`**

Replace the `handleSandyCheck` method body:

```ts
async handleSandyCheck(
  onProgress: ProgressCallback,
  action: "baseline" | "connect",
  imdsPort?: number,
  region?: string,
): Promise<SandyRunResult> {
  const log = this.logger.child({ tool: "sandy_check" })
  log.info({ action, imdsPort, region }, "invoked")
  try {
    const handler = new OutputHandler(onProgress)
    const imageExists = await this.backend.imageExists(handler)
    if (!imageExists) {
      log.warn("no image found")
      return {
        exitCode: 1,
        output: "No image found. Use the sandy_image tool with action 'create' to build one first.",
        sessionName: "",
      }
    }
    const scriptPath = action === "baseline" ? "__baseline__" : "__connect__"
    const port = imdsPort ?? 0
    const session = await this.ensureSession()
    const opts: RunOptions = {
      scriptPath,
      imdsPort: port,
      region: region ?? DEFAULT_REGION,
      session: session.name,
      sessionDir: session.dir,
    }
    const result = await this.backend.run(opts, handler)
    log.info({ exitCode: result.exitCode, session: session.name }, "complete")
    return {
      exitCode: result.exitCode,
      output: result.output,
      sessionName: session.name,
    }
  } catch (err) {
    log.error({ err }, "failed")
    throw err
  }
}
```

- [ ] **Step 7: Add logging to `ensureSession`**

Replace the `ensureSession` method body:

```ts
private async ensureSession(): Promise<ActiveSession> {
  if (!this.activeSession) {
    const resumed = this.resumedName !== null
    const session = await createSession(this.resumedName ?? undefined)
    this.logger.info({ session: session.name, resumed }, "session created")
    this.resumedName = null
    this.activeSession = session
  }
  return this.activeSession
}
```

- [ ] **Step 8: Run all mcp-server tests**

```bash
bun test src/mcp-server.test.ts
```

Expected: PASS — all existing tests still pass (they use the default noopLogger), and all new logging tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/mcp-server.ts src/mcp-server.test.ts
git commit -m "feat: add structured logging to MCP server tool handlers"
```

---

### Task 3: OutputHandler debug hook

When the logger is at debug level, subprocess output lines (both stdout and stderr) are written to the log file. This is controlled by a `createOutputHandler` helper that injects a Pino debug-write callback into OutputHandler's `write` parameter.

**Files:**
- Modify: `src/dummy-backend.ts` (add `stdoutLines` field)
- Modify: `src/mcp-server.ts` (add `createOutputHandler`, use in all handlers)
- Modify: `src/mcp-server.test.ts` (add debug output tests to logging block)

- [ ] **Step 1: Add `stdoutLines` to DummyBackend**

In `src/dummy-backend.ts`, add the field and update the `run` method:

Add field after `progressLines`:
```ts
stdoutLines: string[] = []
```

In the `run` method, after the `progressLines` loop add:
```ts
for (const line of this.stdoutLines) {
  handler.stdoutLine(line)
}
```

- [ ] **Step 2: Write failing tests for debug output logging**

Add these tests inside the existing `describe("logging", ...)` block in `src/mcp-server.test.ts`:

```ts
test("output lines logged at debug level when logger level is debug", async () => {
  const { backend, server, logLines } = setup("debug")
  backend.stdoutLines = ["hello from sandbox"]

  await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

  const lines = logLines()
  expect(lines.some((l) => l.source === "output" && l.msg === "hello from sandbox")).toBe(true)
})

test("output lines not logged when logger level is info", async () => {
  const { backend, server, logLines } = setup("info")
  backend.stdoutLines = ["hello from sandbox"]

  await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

  const lines = logLines()
  expect(lines.some((l) => l.source === "output")).toBe(false)
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test src/mcp-server.test.ts
```

Expected: the "output lines logged at debug level" test FAILS because `handleSandyRun` still creates `OutputHandler` with the default stderr write, not a logger-backed write.

- [ ] **Step 4: Add `createOutputHandler` method to SandyMcpServer**

Add this private method to `SandyMcpServer`:

```ts
private createOutputHandler(onProgress?: ProgressCallback): OutputHandler {
  const progress = onProgress ?? (() => {})
  if (this.logger.isLevelEnabled("debug")) {
    return new OutputHandler(progress, (line) => {
      this.logger.debug({ source: "output" }, line)
    })
  }
  return new OutputHandler(progress)
}
```

- [ ] **Step 5: Replace OutputHandler construction in all handlers**

In `handleSandyCheck`, replace:
```ts
const handler = new OutputHandler(onProgress)
```
with:
```ts
const handler = this.createOutputHandler(onProgress)
```

In `handleSandyImage`, replace:
```ts
const handler = new OutputHandler(onProgress)
```
with:
```ts
const handler = this.createOutputHandler(onProgress)
```

In `handleSandyRun`, replace:
```ts
const handler = new OutputHandler(onProgress ?? (() => {}))
```
with:
```ts
const handler = this.createOutputHandler(onProgress)
```

(The `?? (() => {})` fallback is now handled inside `createOutputHandler`.)

- [ ] **Step 6: Run all mcp-server tests**

```bash
bun test src/mcp-server.test.ts
```

Expected: PASS — all tests including new debug output tests.

- [ ] **Step 7: Commit**

```bash
git add src/dummy-backend.ts src/mcp-server.ts src/mcp-server.test.ts
git commit -m "feat: log subprocess output at debug level via OutputHandler hook"
```

---

### Task 4: Wire logger into CLI MCP command

**Files:**
- Modify: `src/cli/mcp.ts` (create logger, pass to server, accept logger param for testing)
- Modify: `src/cli.test.ts` (pass noopLogger to runMcp)

- [ ] **Step 1: Update CLI MCP test to pass noopLogger**

In `src/cli.test.ts`, add import:
```ts
import { noopLogger } from "./logger"
```

Change the MCP test:
```ts
describe("CLI mcp", () => {
  it("starts MCP server and returns 0", async () => {
    const backend = new DummyBackend()
    const exitCode = await runMcp(backend, console.error, noopLogger())
    expect(exitCode).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/cli.test.ts
```

Expected: FAIL — `runMcp` doesn't accept a third argument (TypeScript error) or the parameter type doesn't match.

- [ ] **Step 3: Update `runMcp` to accept and use a logger**

Replace `src/cli/mcp.ts`:

```ts
import type { CommandModule } from "yargs"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { Backend } from "../backend"
import { SandyMcpServer } from "../mcp-server"
import type { Logger } from "../logger"
import { createLogger } from "../logger"

export async function runMcp(
  backend: Backend,
  printErr: (line: string) => void = console.error,
  logger: Logger = createLogger(),
): Promise<number> {
  try {
    logger.info("MCP server starting")
    const sandy = new SandyMcpServer(backend, process.cwd(), logger)
    const server = sandy.createMcpServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
    return 0
  } catch (err) {
    logger.error({ err }, "MCP server failed")
    printErr(`sandy mcp: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export function makeMcpCommand(backend: Backend): CommandModule {
  return {
    command: "mcp",
    describe: "Start the MCP server",
    handler: async () => {
      const code = await runMcp(backend)
      if (code !== 0) {
        process.exit(code)
      }
    },
  }
}
```

- [ ] **Step 4: Run CLI tests**

```bash
bun test src/cli.test.ts
```

Expected: PASS — MCP test passes with noopLogger, all other CLI tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/cli/mcp.ts src/cli.test.ts
git commit -m "feat: wire Pino logger into MCP CLI command"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run full CI cycle**

```bash
bun run agent
```

Expected: lint, format, build, and all tests pass.

- [ ] **Step 2: Check for untracked files**

```bash
git status
```

Expected: no unexpected untracked files. The `docs/` directory (containing this plan) may show as untracked — that's expected and not part of the feature.

- [ ] **Step 3: Verify binary runs**

Quick smoke test that the compiled binary starts MCP without crashing:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | timeout 5 ./dist/sandy mcp 2>/dev/null || true
```

Expected: the process accepts the JSON-RPC initialize message and produces a response (or times out after 5s, which is fine — it means the server started and is waiting for more input). Check that `$XDG_STATE_HOME/sandy/mcp.log` (or `~/.local/state/sandy/mcp.log`) was created and contains a "MCP server starting" log line.
