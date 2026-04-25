import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createLogger, noopLogger, stateDir } from "./logging"
import { makeTmpDir, type TmpDir } from "./resources"

let testTmpDir: TmpDir

beforeEach(async () => {
  testTmpDir = await makeTmpDir("logger-test-")
  process.env.XDG_STATE_HOME = testTmpDir.path
})

afterEach(async () => {
  await testTmpDir[Symbol.asyncDispose]()
  delete process.env.XDG_STATE_HOME
  delete process.env.SANDY_LOG_LEVEL
})

const LOG_FILE_RE = /^mcp\.pid-\d+\.\d{8}-\d{6}\.log$/

function findLogFiles(): string[] {
  const dir = stateDir()
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir).filter((name) => LOG_FILE_RE.test(name))
}

function readLog(): string[] {
  const files = findLogFiles()
  if (files.length === 0) {
    return []
  }
  const logFile = join(stateDir(), files[0])
  return readFileSync(logFile, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
}

describe("stateDir", () => {
  test("uses XDG_STATE_HOME when set", () => {
    expect(stateDir()).toBe(join(testTmpDir.path, "sandy"))
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
    expect(line).toMatch(/ info {2}plain message$/)
  })

  test("creates the state directory if missing", () => {
    const dir = stateDir()
    expect(existsSync(dir)).toBe(false)
    const logger = createLogger()
    logger.info("x")
    expect(existsSync(dir)).toBe(true)
  })

  test("uses scoped filename mcp.pid-<pid>.<yyyymmdd-hhMMss>.log", () => {
    const logger = createLogger()
    logger.info("x")
    const files = findLogFiles()
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(LOG_FILE_RE)
  })

  test("includes current process pid in filename", () => {
    const logger = createLogger()
    logger.info("x")
    const files = findLogFiles()
    expect(files).toHaveLength(1)
    expect(files[0]).toContain(`pid-${process.pid}.`)
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

  test("does not create any scoped log file", () => {
    noopLogger().info("x")
    expect(findLogFiles()).toHaveLength(0)
  })

  test("child() returns a logger that is also a no-op", () => {
    const child = noopLogger().child({ tool: "x" })
    expect(() => child.info("x")).not.toThrow()
    expect(child.isLevelEnabled("error")).toBe(false)
  })
})

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
    expect(line).toMatch(/ info {2}only message$/)
  })

  test("escapes newline in msg", () => {
    const logger = createLogger()
    logger.info("line1\nline2")
    const line = readLog()[0]
    expect(line).toContain(`line1\\nline2`)
  })
})

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

describe("Error field values", () => {
  test('Error renders as key="<message>" on the main line', () => {
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
      expect(lines[i]).toMatch(/^ {2}/)
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
