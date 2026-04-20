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

const SAFE_VALUE_RE = /^[A-Za-z0-9_.:/-]+$/

function formatValue(value: unknown): string {
  if (value === null) {
    return "null"
  }
  if (value === undefined) {
    return "undefined"
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (typeof value === "string") {
    if (value.length > 0 && SAFE_VALUE_RE.test(value)) {
      return value
    }
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
      const isFirstFrameHeader =
        frames[0]?.startsWith(`Error: ${value.message}`) ||
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

function normalizeLevel(level: string | undefined): Threshold {
  if (
    level === "debug" ||
    level === "info" ||
    level === "warn" ||
    level === "error" ||
    level === "silent"
  ) {
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
    if (!this.isLevelEnabled(level)) {
      return
    }
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

function formatLogTimestamp(now: Date): string {
  const y = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(now.getUTCDate()).padStart(2, "0")
  const hh = String(now.getUTCHours()).padStart(2, "0")
  const min = String(now.getUTCMinutes()).padStart(2, "0")
  const ss = String(now.getUTCSeconds()).padStart(2, "0")
  return `${y}${mm}${dd}-${hh}${min}${ss}`
}

const LOG_FILE_NAME = `mcp.pid-${process.pid}.${formatLogTimestamp(new Date())}.log`

export function createLogger(level?: string): Logger {
  const threshold = LEVEL_VALUE[normalizeLevel(level ?? process.env.SANDY_LOG_LEVEL)]
  const dir = stateDir()
  mkdirSync(dir, { recursive: true })
  const sink = new FileSinkWriter(join(dir, LOG_FILE_NAME))
  return new PlainTextLogger(threshold, sink)
}

export function noopLogger(): Logger {
  return new PlainTextLogger(LEVEL_VALUE.silent, new NoopSink())
}
