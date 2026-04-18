# Plain-Text Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Pino-based logger with a minimal plain-text logger that works in a `bun build --compile` binary, so the `sandy mcp` compiled binary no longer crashes at startup.

**Architecture:** One file `src/logger.ts` rewritten to use `Bun.file().writer()` as the write primitive. Plain-text output: `<ISO timestamp> <level-padded> <msg> <key=value fields>` plus indented stack-trace lines for Error values. Same exported surface (`Logger`, `createLogger`, `noopLogger`, `stateDir`) so no consumer code changes. The `Logger` type becomes an interface defined in this file (not re-exported from pino).

**Tech Stack:** TypeScript, Bun runtime (including `Bun.file().writer()` FileSink), Biome linter/formatter. No external logging library.

**Reference spec:** `docs/superpowers/specs/2026-04-17-logger-plain-text-design.md` — consult for format rules, error handling, and rationale. This plan implements the spec; do not improvise beyond it.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/logger.ts` | Rewrite | `Logger` interface, `createLogger()`, `noopLogger()`, `stateDir()`, plain-text formatter, FileSink writer |
| `src/logger.test.ts` | Rewrite | Format tests (timestamp, level, fields, quoting, child, errors), level threshold, noopLogger behavior |
| `src/mcp-server.test.ts` | Modify (lines 1-4, 297-343) | Remove `import pino from "pino"`; swap `logLines()` helper to parse plain text; update `level === 50` assertions to `level === "error"` |
| `package.json` | Modify | Remove `pino` from dependencies |
| `bun.lock` / `bun.lockb` | Regenerate | Via `bun install` after package.json change |

No changes to `src/mcp-server.ts`, `src/cli/mcp.ts`, `src/dummy-backend.ts`, or `src/cli.test.ts` — they use only the methods/types preserved in the new logger.

---

### Task 1: Core scaffolding — interface, level threshold, basic format

**Files:**
- Rewrite: `src/logger.ts`
- Rewrite: `src/logger.test.ts`

This task stands up the new `Logger` interface with a working end-to-end write path covering the simplest case: timestamp, level-padding, message, no fields. It also implements `noopLogger()` and verifies it never touches the filesystem. Subsequent tasks add fields, child bindings, and Error handling.

- [ ] **Step 1: Replace `src/logger.test.ts` with the baseline test file**

Overwrite `src/logger.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createLogger, noopLogger, stateDir } from "./logger"

const testTmpDir = join(import.meta.dir, "..", ".tmp-test-logger")

beforeEach(() => {
  mkdirSync(testTmpDir, { recursive: true })
  process.env.XDG_STATE_HOME = testTmpDir
})

afterEach(() => {
  if (existsSync(testTmpDir)) {
    rmSync(testTmpDir, { recursive: true, force: true })
  }
  delete process.env.XDG_STATE_HOME
  delete process.env.SANDY_LOG_LEVEL
})

function readLog(): string[] {
  const logFile = join(stateDir(), "mcp.log")
  if (!existsSync(logFile)) return []
  return readFileSync(logFile, "utf8").split("\n").filter((l) => l.length > 0)
}

describe("stateDir", () => {
  test("uses XDG_STATE_HOME when set", () => {
    expect(stateDir()).toBe(join(testTmpDir, "sandy"))
  })

  test("falls back to ~/.local/state/sandy when XDG_STATE_HOME is unset", () => {
    delete process.env.XDG_STATE_HOME
    expect(stateDir()).toBe(join(homedir(), ".local", "state", "sandy"))
  })
})

describe("createLogger — basic format", () => {
  test("writes a single line per call", () => {
    const logger = createLogger()
    logger.info("hello")
    const lines = readLog()
    expect(lines).toHaveLength(1)
  })

  test("line starts with ISO 8601 UTC timestamp including milliseconds", () => {
    const logger = createLogger()
    logger.info("hello")
    const line = readLog()[0]
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /)
  })

  test("level column is 5 characters, space-padded", () => {
    const logger = createLogger("debug")
    logger.info("a")
    logger.warn("b")
    logger.error("c")
    logger.debug("d")
    const lines = readLog()
    expect(lines[0]).toContain(" info  a")
    expect(lines[1]).toContain(" warn  b")
    expect(lines[2]).toContain(" error c")
    expect(lines[3]).toContain(" debug d")
  })

  test("message appears after level, unquoted", () => {
    const logger = createLogger()
    logger.info("plain message")
    const line = readLog()[0]
    expect(line).toMatch(/ info  plain message$/)
  })

  test("creates the state directory if missing", () => {
    const dir = stateDir()
    expect(existsSync(dir)).toBe(false)
    const logger = createLogger()
    logger.info("x")
    expect(existsSync(dir)).toBe(true)
  })
})

describe("createLogger — level threshold", () => {
  test("info level suppresses debug", () => {
    const logger = createLogger("info")
    logger.debug("hidden")
    expect(readLog()).toHaveLength(0)
  })

  test("warn level suppresses info and debug", () => {
    const logger = createLogger("warn")
    logger.info("hidden")
    logger.debug("hidden")
    logger.warn("shown")
    const lines = readLog()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("shown")
  })

  test("error level passes error calls only", () => {
    const logger = createLogger("error")
    logger.warn("hidden")
    logger.error("shown")
    const lines = readLog()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(" error shown")
  })

  test("silent level suppresses everything", () => {
    const logger = createLogger("silent")
    logger.error("hidden")
    expect(readLog()).toHaveLength(0)
  })

  test("reads level from SANDY_LOG_LEVEL when no argument given", () => {
    process.env.SANDY_LOG_LEVEL = "warn"
    const logger = createLogger()
    expect(logger.isLevelEnabled("warn")).toBe(true)
    expect(logger.isLevelEnabled("info")).toBe(false)
  })

  test("unknown level string falls back to info", () => {
    const logger = createLogger("nonsense")
    expect(logger.isLevelEnabled("info")).toBe(true)
    expect(logger.isLevelEnabled("debug")).toBe(false)
  })
})

describe("isLevelEnabled", () => {
  test("returns true for levels at or above threshold", () => {
    const logger = createLogger("info")
    expect(logger.isLevelEnabled("info")).toBe(true)
    expect(logger.isLevelEnabled("warn")).toBe(true)
    expect(logger.isLevelEnabled("error")).toBe(true)
  })

  test("returns false for levels below threshold", () => {
    const logger = createLogger("info")
    expect(logger.isLevelEnabled("debug")).toBe(false)
  })
})

describe("noopLogger", () => {
  test("methods do not throw", () => {
    const logger = noopLogger()
    expect(() => {
      logger.info("x")
      logger.info({ a: 1 }, "x")
      logger.debug("x")
      logger.warn("x")
      logger.error("x")
    }).not.toThrow()
  })

  test("isLevelEnabled returns false for every level", () => {
    const logger = noopLogger()
    expect(logger.isLevelEnabled("debug")).toBe(false)
    expect(logger.isLevelEnabled("info")).toBe(false)
    expect(logger.isLevelEnabled("warn")).toBe(false)
    expect(logger.isLevelEnabled("error")).toBe(false)
  })

  test("does not create the state directory", () => {
    noopLogger().info("x")
    expect(existsSync(stateDir())).toBe(false)
  })

  test("does not create mcp.log", () => {
    noopLogger().info("x")
    expect(existsSync(join(stateDir(), "mcp.log"))).toBe(false)
  })

  test("child() returns a logger that is also a no-op", () => {
    const child = noopLogger().child({ tool: "x" })
    expect(() => child.info("x")).not.toThrow()
    expect(child.isLevelEnabled("error")).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/logger.test.ts
```

Expected: MANY failures — `createLogger` still returns a Pino logger whose format is JSON, not plain text. Some tests may error on parse-shape mismatches.

- [ ] **Step 3: Replace `src/logger.ts` with the new implementation**

Overwrite `src/logger.ts` with:

```ts
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

export type Level = "debug" | "info" | "warn" | "error"
type Threshold = Level | "silent"

export interface Logger {
  info(msg: string): void
  info(fields: Record<string, unknown>, msg: string): void
  warn(msg: string): void
  warn(fields: Record<string, unknown>, msg: string): void
  error(msg: string): void
  error(fields: Record<string, unknown>, msg: string): void
  debug(msg: string): void
  debug(fields: Record<string, unknown>, msg: string): void
  child(bindings: Record<string, unknown>): Logger
  isLevelEnabled(level: Level): boolean
}

const LEVEL_VALUE: Record<Threshold, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 100,
}

const LEVEL_LABEL: Record<Level, string> = {
  debug: "debug",
  info: "info ",
  warn: "warn ",
  error: "error",
}

function normalizeLevel(level: string | undefined): Threshold {
  if (level === "debug" || level === "info" || level === "warn" || level === "error" || level === "silent") {
    return level
  }
  return "info"
}

export function stateDir(): string {
  const xdg = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state")
  return join(xdg, "sandy")
}

interface Sink {
  write(line: string): void
}

function formatLine(level: Level, bindings: Record<string, unknown>, args: unknown[]): string {
  const msg = typeof args[0] === "string" ? args[0] : String((args[1] as string) ?? "")
  const escapedMsg = msg.replace(/\n/g, "\\n")
  const ts = new Date().toISOString()
  return `${ts} ${LEVEL_LABEL[level]} ${escapedMsg}\n`
}

class PlainTextLogger implements Logger {
  constructor(
    private readonly threshold: number,
    private readonly sink: Sink,
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  isLevelEnabled(level: Level): boolean {
    return LEVEL_VALUE[level] >= this.threshold
  }

  private emit(level: Level, args: unknown[]): void {
    if (!this.isLevelEnabled(level)) return
    try {
      this.sink.write(formatLine(level, this.bindings, args))
    } catch {
      // Swallow logging errors — must never crash the caller.
    }
  }

  info(...args: unknown[]): void {
    this.emit("info", args)
  }
  warn(...args: unknown[]): void {
    this.emit("warn", args)
  }
  error(...args: unknown[]): void {
    this.emit("error", args)
  }
  debug(...args: unknown[]): void {
    this.emit("debug", args)
  }

  child(bindings: Record<string, unknown>): Logger {
    return new PlainTextLogger(this.threshold, this.sink, { ...this.bindings, ...bindings })
  }
}

class NoopSink implements Sink {
  write(): void {}
}

class FileSinkWriter implements Sink {
  private readonly writer: ReturnType<ReturnType<typeof Bun.file>["writer"]>
  constructor(path: string) {
    this.writer = Bun.file(path).writer()
  }
  write(line: string): void {
    this.writer.write(line)
    this.writer.flush()
  }
}

export function createLogger(level?: string): Logger {
  const threshold = LEVEL_VALUE[normalizeLevel(level ?? process.env.SANDY_LOG_LEVEL)]
  const dir = stateDir()
  mkdirSync(dir, { recursive: true })
  const sink = new FileSinkWriter(join(dir, "mcp.log"))
  return new PlainTextLogger(threshold, sink)
}

export function noopLogger(): Logger {
  return new PlainTextLogger(LEVEL_VALUE.silent, new NoopSink())
}
```

Note: `formatLine` currently ignores `bindings` and the field-object form of `args`. Field formatting is implemented in Task 2; this step only satisfies the basic-format tests.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/logger.test.ts
```

Expected: all tests in Task 1 pass. Tests referring to fields, `child()`, Error values, and multi-arg overloads may fail — that's fine, they're covered by later tasks that don't exist as tests yet. (If any Task 1 test fails, fix before committing.)

- [ ] **Step 5: Commit**

```bash
git add src/logger.ts src/logger.test.ts
git commit -m "feat: replace pino Logger with plain-text skeleton"
```

---

### Task 2: Field formatting

**Files:**
- Modify: `src/logger.ts` (expand `formatLine`)
- Modify: `src/logger.test.ts` (append new describe block)

Field rendering rules (from spec):
- Safe values (matching `/^[A-Za-z0-9_.:\/\-]+$/` and non-empty) render unquoted
- Strings with spaces, quotes, etc. go through `JSON.stringify`
- Numbers and booleans render as their string forms (safe under the regex)
- `null` renders unquoted as `null`; `undefined` renders unquoted as `undefined`
- Non-Error objects render via `JSON.stringify`
- Fields appear in insertion order

- [ ] **Step 1: Append field-formatting tests to `src/logger.test.ts`**

Add at the end of the file:

```ts
describe("field formatting", () => {
  test("renders safe string values unquoted", () => {
    const logger = createLogger()
    logger.info({ tool: "sandy_run" }, "invoked")
    const line = readLog()[0]
    expect(line).toContain("invoked tool=sandy_run")
  })

  test("JSON-quotes string values containing spaces", () => {
    const logger = createLogger()
    logger.info({ note: "hello world" }, "msg")
    const line = readLog()[0]
    expect(line).toContain(`note="hello world"`)
  })

  test("JSON-quotes string values containing equals sign", () => {
    const logger = createLogger()
    logger.info({ x: "a=b" }, "m")
    const line = readLog()[0]
    expect(line).toContain(`x="a=b"`)
  })

  test("JSON-quotes string values containing double quotes", () => {
    const logger = createLogger()
    logger.info({ x: 'he said "hi"' }, "m")
    const line = readLog()[0]
    expect(line).toContain(`x="he said \\"hi\\""`)
  })

  test("renders numbers unquoted", () => {
    const logger = createLogger()
    logger.info({ count: 42 }, "m")
    const line = readLog()[0]
    expect(line).toContain("count=42")
  })

  test("renders booleans unquoted", () => {
    const logger = createLogger()
    logger.info({ ok: true, bad: false }, "m")
    const line = readLog()[0]
    expect(line).toContain("ok=true")
    expect(line).toContain("bad=false")
  })

  test("renders null unquoted", () => {
    const logger = createLogger()
    logger.info({ x: null }, "m")
    const line = readLog()[0]
    expect(line).toContain("x=null")
  })

  test("renders undefined unquoted", () => {
    const logger = createLogger()
    logger.info({ x: undefined }, "m")
    const line = readLog()[0]
    expect(line).toContain("x=undefined")
  })

  test("renders non-Error objects as JSON", () => {
    const logger = createLogger()
    logger.info({ obj: { a: 1, b: "x" } }, "m")
    const line = readLog()[0]
    expect(line).toContain(`obj={"a":1,"b":"x"}`)
  })

  test("fields appear in insertion order", () => {
    const logger = createLogger()
    logger.info({ a: 1, b: 2, c: 3 }, "m")
    const line = readLog()[0]
    const idxA = line.indexOf("a=1")
    const idxB = line.indexOf("b=2")
    const idxC = line.indexOf("c=3")
    expect(idxA).toBeLessThan(idxB)
    expect(idxB).toBeLessThan(idxC)
  })

  test("empty string renders as JSON-quoted empty", () => {
    const logger = createLogger()
    logger.info({ x: "" }, "m")
    const line = readLog()[0]
    expect(line).toContain(`x=""`)
  })

  test("msg-only call omits fields", () => {
    const logger = createLogger()
    logger.info("only message")
    const line = readLog()[0]
    expect(line).toMatch(/ info  only message$/)
  })

  test("escapes newline in msg", () => {
    const logger = createLogger()
    logger.info("line1\nline2")
    const line = readLog()[0]
    expect(line).toContain(`line1\\nline2`)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/logger.test.ts
```

Expected: all new field-formatting tests fail. Existing tests from Task 1 still pass.

- [ ] **Step 3: Replace `formatLine` in `src/logger.ts` with the full field-aware version**

Replace the existing `formatLine` function with:

```ts
const SAFE_VALUE_RE = /^[A-Za-z0-9_.:\/\-]+$/

function formatValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "string") {
    if (value.length > 0 && SAFE_VALUE_RE.test(value)) return value
    return JSON.stringify(value)
  }
  if (value instanceof Error) {
    return JSON.stringify(value.message)
  }
  return JSON.stringify(value)
}

function parseArgs(
  bindings: Record<string, unknown>,
  args: unknown[],
): { msg: string; fields: Record<string, unknown> } {
  if (args.length >= 2 && typeof args[0] === "object" && args[0] !== null) {
    return {
      msg: String(args[1] ?? ""),
      fields: { ...bindings, ...(args[0] as Record<string, unknown>) },
    }
  }
  return { msg: String(args[0] ?? ""), fields: { ...bindings } }
}

function formatLine(level: Level, bindings: Record<string, unknown>, args: unknown[]): string {
  const { msg, fields } = parseArgs(bindings, args)
  const escapedMsg = msg.replace(/\n/g, "\\n")
  const ts = new Date().toISOString()
  let line = `${ts} ${LEVEL_LABEL[level]} ${escapedMsg}`
  for (const [key, value] of Object.entries(fields)) {
    line += ` ${key}=${formatValue(value)}`
  }
  return `${line}\n`
}
```

Note: `formatValue` handles Error values as message-only strings. Stack rendering is added in Task 4.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/logger.test.ts
```

Expected: all field-formatting tests pass. Task 1 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/logger.ts src/logger.test.ts
git commit -m "feat: add field formatting to plain-text logger"
```

---

### Task 3: child() bindings

**Files:**
- Modify: `src/logger.test.ts` (append describe block)

No implementation changes needed — `child()` already wires through `this.bindings`, and `parseArgs` already merges `bindings` with per-call fields. This task adds explicit tests to lock in the behavior.

- [ ] **Step 1: Append child() tests to `src/logger.test.ts`**

Add at the end of the file:

```ts
describe("child() bindings", () => {
  test("child bindings appear in each log call", () => {
    const logger = createLogger()
    const child = logger.child({ tool: "sandy_run" })
    child.info("invoked")
    const line = readLog()[0]
    expect(line).toContain("invoked tool=sandy_run")
  })

  test("child bindings merge with per-call fields", () => {
    const logger = createLogger()
    const child = logger.child({ tool: "sandy_run" })
    child.info({ session: "abc-def" }, "complete")
    const line = readLog()[0]
    expect(line).toContain("tool=sandy_run")
    expect(line).toContain("session=abc-def")
  })

  test("child bindings appear before per-call fields", () => {
    const logger = createLogger()
    const child = logger.child({ a: 1 })
    child.info({ b: 2 }, "m")
    const line = readLog()[0]
    const idxA = line.indexOf("a=1")
    const idxB = line.indexOf("b=2")
    expect(idxA).toBeGreaterThan(-1)
    expect(idxB).toBeGreaterThan(idxA)
  })

  test("per-call field overrides child binding of same key", () => {
    const logger = createLogger()
    const child = logger.child({ tool: "parent" })
    child.info({ tool: "child" }, "m")
    const line = readLog()[0]
    expect(line).toContain("tool=child")
    expect(line).not.toContain("tool=parent")
  })

  test("child of child accumulates bindings", () => {
    const logger = createLogger()
    const c1 = logger.child({ a: 1 })
    const c2 = c1.child({ b: 2 })
    c2.info("m")
    const line = readLog()[0]
    expect(line).toContain("a=1")
    expect(line).toContain("b=2")
  })

  test("parent logger is unaffected by child bindings", () => {
    const logger = createLogger()
    logger.child({ a: 1 })
    logger.info("m")
    const line = readLog()[0]
    expect(line).not.toContain("a=1")
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
bun test src/logger.test.ts
```

Expected: all child() tests pass on first run (behavior was already implemented in Task 2).

If any fail: the `parseArgs` merge order in Task 2 is wrong. The spec requires child bindings **before** per-call fields — fix by swapping spread order to `{ ...bindings, ...args[0] }` (per-call fields overwrite child bindings of the same key). The version in Task 2 is already correct; if a test fails here, something was altered.

- [ ] **Step 3: Commit**

```bash
git add src/logger.test.ts
git commit -m "test: lock in child() binding behavior for plain-text logger"
```

---

### Task 4: Error values with stack

**Files:**
- Modify: `src/logger.ts` (teach `formatLine` about Error values)
- Modify: `src/logger.test.ts` (append describe block)

Error handling rules (from spec):
- When a field value is an `Error`, its `message` appears on the main line as `key="<message>"`
- If `.stack` exists, each stack line (split on `\n`, trimmed, empty lines skipped) is written on a following line prefixed with two spaces
- The first stack frame is typically `Error: <message>`, which duplicates the main-line value — it is skipped
- Only the first Error field emits its stack; subsequent Error fields render as `key="<message>"` only

- [ ] **Step 1: Append Error-formatting tests to `src/logger.test.ts`**

Add at the end of the file:

```ts
describe("Error field values", () => {
  test("Error renders as key=\"<message>\" on the main line", () => {
    const logger = createLogger()
    logger.error({ err: new Error("boom") }, "failed")
    const lines = readLog()
    expect(lines[0]).toContain(`err="boom"`)
  })

  test("Error stack lines follow, indented two spaces", () => {
    const logger = createLogger()
    try {
      throw new Error("boom")
    } catch (err) {
      logger.error({ err }, "failed")
    }
    const lines = readLog()
    expect(lines.length).toBeGreaterThan(1)
    // First line is the main entry
    expect(lines[0]).toContain(`err="boom"`)
    // Subsequent lines are stack frames indented two spaces
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toMatch(/^  /)
    }
  })

  test("first stack frame (Error: <msg>) is not emitted", () => {
    const logger = createLogger()
    try {
      throw new Error("boom")
    } catch (err) {
      logger.error({ err }, "failed")
    }
    const lines = readLog()
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).not.toContain("Error: boom")
    }
  })

  test("stack skips empty lines", () => {
    const logger = createLogger()
    const err = new Error("x")
    err.stack = "Error: x\n\n    at foo\n\n    at bar"
    logger.error({ err }, "m")
    const lines = readLog()
    // Expect main line + 2 stack lines ("at foo", "at bar")
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("at foo")
    expect(lines[2]).toContain("at bar")
  })

  test("Error without stack emits only the main line", () => {
    const logger = createLogger()
    const err = new Error("no stack")
    err.stack = undefined
    logger.error({ err }, "m")
    const lines = readLog()
    expect(lines).toHaveLength(1)
  })

  test("other fields still render on the main line before the stack", () => {
    const logger = createLogger()
    try {
      throw new Error("boom")
    } catch (err) {
      logger.error({ tool: "sandy_run", err, session: "abc" }, "failed")
    }
    const lines = readLog()
    expect(lines[0]).toContain("tool=sandy_run")
    expect(lines[0]).toContain(`err="boom"`)
    expect(lines[0]).toContain("session=abc")
  })

  test("only the first Error emits its stack", () => {
    const logger = createLogger()
    const e1 = new Error("first")
    e1.stack = "Error: first\n    at aaa"
    const e2 = new Error("second")
    e2.stack = "Error: second\n    at bbb"
    logger.error({ e1, e2 }, "m")
    const lines = readLog()
    expect(lines[0]).toContain(`e1="first"`)
    expect(lines[0]).toContain(`e2="second"`)
    const stackBlock = lines.slice(1).join("\n")
    expect(stackBlock).toContain("at aaa")
    expect(stackBlock).not.toContain("at bbb")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/logger.test.ts
```

Expected: the "stack lines follow", "first stack frame skipped", "stack skips empty lines", "other fields before stack", and "only first Error emits stack" tests fail. The "renders as message" test may already pass (formatValue handles Errors). "Without stack emits only main line" may pass.

- [ ] **Step 3: Rework `formatLine` in `src/logger.ts` to emit stack lines**

Replace the existing `formatLine` function with:

```ts
function formatLine(level: Level, bindings: Record<string, unknown>, args: unknown[]): string {
  const { msg, fields } = parseArgs(bindings, args)
  const escapedMsg = msg.replace(/\n/g, "\\n")
  const ts = new Date().toISOString()
  let mainLine = `${ts} ${LEVEL_LABEL[level]} ${escapedMsg}`
  let stackBlock = ""
  let stackEmitted = false
  for (const [key, value] of Object.entries(fields)) {
    mainLine += ` ${key}=${formatValue(value)}`
    if (!stackEmitted && value instanceof Error && typeof value.stack === "string") {
      const frames = value.stack
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      const isFirstFrameHeader = frames[0]?.startsWith(`Error: ${value.message}`) ||
        frames[0] === `Error: ${value.message}` ||
        frames[0]?.startsWith(`${value.name}: ${value.message}`)
      const tail = isFirstFrameHeader ? frames.slice(1) : frames
      if (tail.length > 0) {
        stackBlock = tail.map((f) => `  ${f}\n`).join("")
        stackEmitted = true
      }
    }
  }
  return `${mainLine}\n${stackBlock}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/logger.test.ts
```

Expected: all Error-formatting tests pass. All prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/logger.ts src/logger.test.ts
git commit -m "feat: emit Error stack lines in plain-text logger"
```

---

### Task 5: Wire mcp-server.test.ts to the new logger

**Files:**
- Modify: `src/mcp-server.test.ts` — replace pino with `createLogger` from `./logger`, rewrite `logLines()` helper, update level assertions

The existing `describe("logging", ...)` block at lines 297–431 of `src/mcp-server.test.ts` imports pino directly to construct a test logger, and parses log lines as JSON. Both must change.

`src/mcp-server.ts` is unchanged — it still uses the `Logger` type imported from `./logger`, which Task 1 redefined with the same method signatures consumers require.

- [ ] **Step 1: Replace the pino import line with the new logger import**

In `src/mcp-server.test.ts`, change line 4 from:

```ts
import pino from "pino"
```

to:

```ts
import { createLogger } from "./logger"
```

Also expand the `node:fs` import on line 2 to include `mkdirSync` and `existsSync`:

```ts
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
```

- [ ] **Step 2: Replace the `setup()` helper and `logLines()` parser in the logging describe block**

Locate the `describe("logging", ...)` block (starts around line 297). Replace the entire `setup()` function and the `afterEach` in that block with:

```ts
  interface LogRecord {
    timestamp: string
    level: string
    msg: string
    fields: Record<string, string>
    stack: string[]
  }

  const LOG_LINE_RE =
    /^(?<timestamp>\S+) (?<level>debug|info |warn |error) (?<rest>.*)$/

  function parseLogFile(content: string): LogRecord[] {
    const rawLines = content.split("\n")
    const records: LogRecord[] = []
    let current: LogRecord | null = null
    for (const line of rawLines) {
      if (line.length === 0) continue
      if (line.startsWith("  ")) {
        if (current) current.stack.push(line.slice(2))
        continue
      }
      const match = LOG_LINE_RE.exec(line)
      if (!match || !match.groups) continue
      const { timestamp, level, rest } = match.groups
      // rest = "<msg> [k=v k=v ...]"
      const fields: Record<string, string> = {}
      // Split off fields greedily from the right:
      // a field is " <key>=<value>" where <key> is a safe identifier.
      // <value> is either JSON-quoted or safe-unquoted.
      const tokens: string[] = []
      let remaining = rest
      while (true) {
        const m = remaining.match(/ ([A-Za-z_][A-Za-z0-9_]*)=((?:"(?:\\.|[^"\\])*")|[^ ]+)$/)
        if (!m) break
        tokens.unshift(m[0])
        remaining = remaining.slice(0, m.index)
      }
      const msg = remaining
      for (const tok of tokens) {
        const kv = tok.match(/ ([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
        if (!kv) continue
        const [, k, vRaw] = kv
        let v = vRaw
        if (v.startsWith(`"`) && v.endsWith(`"`)) {
          try {
            v = JSON.parse(v)
          } catch {
            // leave as-is
          }
        }
        fields[k] = v
      }
      current = { timestamp, level: level.trim(), msg, fields, stack: [] }
      records.push(current)
    }
    return records
  }

  function setup(level: string = "info") {
    const logDir = join(import.meta.dir, "../.tmp-test-mcp-log")
    rmSync(logDir, { recursive: true, force: true })
    mkdirSync(logDir, { recursive: true })
    process.env.XDG_STATE_HOME = logDir

    const logger = createLogger(level)
    const backend = new DummyBackend()
    const server = new SandyMcpServer(backend, process.cwd(), logger)

    function logLines(): LogRecord[] {
      const logFile = join(logDir, "sandy", "mcp.log")
      if (!existsSync(logFile)) return []
      return parseLogFile(readFileSync(logFile, "utf-8"))
    }

    return { backend, server, logDir, logLines }
  }

  afterEach(() => {
    const logDir = join(import.meta.dir, "../.tmp-test-mcp-log")
    rmSync(logDir, { recursive: true, force: true })
    delete process.env.XDG_STATE_HOME
  })
```

- [ ] **Step 3: Update the assertions in each test within the logging block**

The records returned from `logLines()` now have shape `{ timestamp, level, msg, fields, stack }`. Change every assertion in the logging block:

- `l.tool === "sandy_run"` → `l.fields.tool === "sandy_run"`
- `l.msg === "invoked"` → `l.msg === "invoked"` (unchanged)
- `l.level === 50` → `l.level === "error"`
- `l.level === 40` (if present) → `l.level === "warn"`
- `l.session === "my-session"` → `l.fields.session === "my-session"`
- `sessionLog?.session` → `sessionLog?.fields.session`
- `l.source === "output"` → `l.fields.source === "output"`

Apply each substitution to the following tests (line numbers from the pre-change file, approximate):
- `handleSandyRun logs invocation and completion`
- `handleSandyImage logs invocation and completion (action create)`
- `handleSandyCheck logs invocation and completion (imageExistsResult = true)`
- `handleSandyCheck logs error when no image found (imageExistsResult = false)`
- `ensureSession logs session creation on first tool call`
- `handler error is logged before re-throwing`
- `output lines logged at debug level when logger level is debug`
- `output lines not logged when logger level is info`
- `handleResumeSession logs session resume requested`

Worked example — change:
```ts
test("handleSandyRun logs invocation and completion", async () => {
  const { server, logLines } = setup()
  await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

  const logs = logLines()
  expect(logs.some((l) => l.tool === "sandy_run" && l.msg === "invoked")).toBe(true)
  expect(logs.some((l) => l.tool === "sandy_run" && l.msg === "complete")).toBe(true)
})
```

to:
```ts
test("handleSandyRun logs invocation and completion", async () => {
  const { server, logLines } = setup()
  await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

  const logs = logLines()
  expect(logs.some((l) => l.fields.tool === "sandy_run" && l.msg === "invoked")).toBe(true)
  expect(logs.some((l) => l.fields.tool === "sandy_run" && l.msg === "complete")).toBe(true)
})
```

Apply the analogous change to each remaining logging test.

- [ ] **Step 4: Run the mcp-server tests**

```bash
bun test src/mcp-server.test.ts
```

Expected: all tests pass, including all 10 tests in the logging describe block. Non-logging tests (session management, progress, resources, etc.) should be unaffected.

If the plain-text parser fails on a specific line shape, fix the regex in `parseLogFile` (not the logger output). The parser is test-side code; adapt it to match what the logger produces.

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server.test.ts
git commit -m "test: parse plain-text logs in mcp-server logging tests"
```

---

### Task 6: Remove pino dependency and verify binary

**Files:**
- Modify: `package.json` (remove pino)
- Regenerate: `bun.lock` or `bun.lockb` via `bun install`

- [ ] **Step 1: Verify pino is no longer imported anywhere**

```bash
bun run lint
```

Then:
```bash
grep -R "from \"pino\"" src/ || echo "no pino imports"
grep -R "require(\"pino\")" src/ || echo "no pino requires"
```

Expected: both greps print "no pino imports" / "no pino requires".

If any pino import remains, Task 5 missed a spot — fix and re-run.

- [ ] **Step 2: Remove pino from `package.json` dependencies**

Open `package.json` and delete the `"pino": "^10.3.1"` line from the `dependencies` object. Mind the trailing comma on the preceding line.

- [ ] **Step 3: Reinstall to update the lockfile**

```bash
bun install
```

Expected: bun removes pino and its transitive deps; lockfile regenerates.

- [ ] **Step 4: Run the full CI cycle**

```bash
bun run agent
```

Expected: lint, format, build, and test all pass. The `build` step produces `dist/sandy`.

- [ ] **Step 5: Smoke-test the compiled binary**

```bash
dist/sandy --help
```

Expected: the help output appears. The binary no longer crashes at startup.

If `dist/sandy --help` is killed, the Bun binary still has a startup issue beyond pino — investigate (e.g. check `file dist/sandy`, `codesign -v dist/sandy`, `~/Library/Logs/DiagnosticReports/`).

- [ ] **Step 6: Smoke-test MCP startup**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | timeout 5 dist/sandy mcp
```

Expected: the process reads the JSON-RPC initialize message and either responds on stdout or waits for more input (timeout after 5s is fine). No `zsh: killed`.

Then check the log file:
```bash
cat ~/.local/state/sandy/mcp.log
```

Expected: at least one line containing `MCP server starting` in plain-text format.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock bun.lockb 2>/dev/null; true
git commit -m "chore: remove pino dependency now that plain-text logger replaces it"
```

(The `2>/dev/null; true` handles whichever lockfile format this project uses — only one will exist.)

---

## Final verification

After Task 6 completes:

```bash
bun run agent
git status
```

Expected: all tests green, no untracked files from the implementation (the `docs/` tree containing this plan and the spec is expected to be present but not tracked).
