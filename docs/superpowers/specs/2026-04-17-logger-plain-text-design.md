# Plain-Text Logger Design

## Problem

The current logger (`src/logger.ts`) uses Pino. It works in source (`bun src/main.ts mcp`) but the Bun-compiled binary (`dist/sandy mcp`) is killed at startup — even `sandy --help` is terminated before any user code runs. Pino bundles `thread-stream` and related workers whose path resolution fails inside a compiled Bun single-file executable, even when `pino.destination({ sync: true })` is used. `sync: true` avoids the worker at call time but not at import time.

Sandy ships as a compiled binary. Any logging solution must work in that binary.

## Goals

- Replace Pino with a minimal logger that runs correctly in `bun build --compile` output.
- Keep the existing consumer API unchanged: `createLogger()`, `noopLogger()`, `stateDir()`, and the `Logger` methods (`info/warn/error/debug` with `(msg)` or `(fields, msg)` overloads, plus `child(bindings)` and `isLevelEnabled(level)`).
- Output plain-text lines optimized for human readability. No JSON.
- At `debug` level, subprocess output continues to stream into the log file (already wired via `OutputHandler`'s write hook — this design preserves that pathway).

## Non-goals

- Multi-process logging, log rotation, remote shipping, or structured ingestion pipelines. The MCP server is one long-lived process writing to one local file; those concerns can be added later if needed.
- Pino compatibility. `pino-pretty` will not read the new output.

## Architecture

One file, `src/logger.ts`, exports the same surface as today. Internally:

1. A `Logger` interface replacing Pino's `Logger` type.
2. A concrete implementation backed by a `Bun.file(path).writer()` `FileSink`.
3. `createLogger()` opens the sink once, builds the root logger, and returns it.
4. `noopLogger()` returns an implementation whose methods are empty and whose `isLevelEnabled` always returns `false`. It opens no file.
5. `child(bindings)` returns a new logger instance that shares the same sink and level but merges additional bindings into every log call.

Write path: `log.info(fields, msg)` → check level threshold → format line → `sink.write(line)` → `sink.flush()`. Flush on every write keeps logs durable in an MCP crash scenario without forcing the process to manage shutdown hooks.

## Output format

```
2026-04-17T12:34:56.789Z info  invoked tool=sandy_run script=foo.ts region=us-west-2
2026-04-17T12:34:56.800Z error failed tool=sandy_run err="invalid script path"
  at validateScriptPath (src/mcp-server.ts:82:13)
  at handleSandyRun (src/mcp-server.ts:206:10)
```

Format rules:

- **Timestamp:** ISO 8601 with milliseconds, UTC (`Z` suffix). `new Date().toISOString()`.
- **Level column:** 5-char, left-aligned, space-padded: `"info "`, `"warn "`, `"error"`, `"debug"`.
- **Message:** the string argument, unquoted, as-is. If the message itself contains a newline it is replaced with `\n` (escape, not literal) so entries stay single-line — unless the entry is an error, in which case the stack trace follows on separate indented lines (see below).
- **Fields:** `key=value`, space-separated, appended after the message in the order they appear in the merged bindings object (parent `child()` bindings first, then per-call fields). Keys are written verbatim. Values use these rules:
  - A value is "safe" if it matches `/^[A-Za-z0-9_.:\/\-]+$/` and is non-empty. Safe values are written without quotes.
  - Any other primitive value (including empty string) is written as `JSON.stringify(value)`, which quotes it and escapes whitespace, backslashes, and quotes.
  - Numbers and booleans are converted to their string forms; both are safe under the regex.
  - `null` and `undefined` are rendered as `null` and `undefined` (unquoted).
  - Objects (other than `Error`) are `JSON.stringify`'d.
- **Error values:** when a field value is an `Error` instance, its `message` appears on the main line as `key="<message>"`. If the error has a `.stack`, each stack line (split on `\n`, trimmed, empty lines skipped) is written on a separate following line prefixed with two spaces. The first stack frame is typically `Error: <message>`, which duplicates the main-line value — it is skipped. No other fields are lost: all fields still render on the main line in insertion order; the stack is appended after the main line is complete. If multiple fields are `Error` instances, only the first one emits its stack; the others render as `key="<message>"` only.
- **Trailing newline:** each log entry ends with `\n`. Error stack lines each end with `\n`.

## API

```ts
export type Level = "debug" | "info" | "warn" | "error"

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

export function stateDir(): string
export function createLogger(level?: string): Logger
export function noopLogger(): Logger
```

- `createLogger(level?)` — level resolves to the argument, then `SANDY_LOG_LEVEL`, then `"info"`. Valid levels: `debug`, `info`, `warn`, `error`, `silent`. Unknown values fall back to `info` (no throw — a bad env var must not crash the MCP server).
- `noopLogger()` — level is `silent`. Returns `false` from `isLevelEnabled` for every level. Methods do nothing. Does not call `mkdirSync` or open a file.
- `stateDir()` — unchanged from today.

## Level thresholds

Internal numeric mapping (not exposed in the format — levels are spelled out as words in output):

```
debug  = 20
info   = 30
warn   = 40
error  = 50
silent = 100
```

A call at level X is emitted iff `levelValue(X) >= threshold`. `silent` sets the threshold to `100`, above every call level.

## Consumer code

No changes to `src/mcp-server.ts`, `src/cli/mcp.ts`, or any test file outside `src/logger.test.ts` and `src/mcp-server.test.ts` (the latter only because the existing logging describe block parses JSON from the log file — that helper needs to parse plain text instead).

## Package changes

- Remove `pino` from `package.json` dependencies.
- Run `bun install` to update the lockfile.

## Testing

### `src/logger.test.ts`

Keep the existing `stateDir` and `noopLogger` tests. Rewrite `createLogger` tests and add format tests:

- **stateDir** (unchanged)
  - uses `XDG_STATE_HOME` when set
  - falls back to `~/.local/state/sandy`

- **createLogger — basics**
  - writes a line to `mcp.log` in the state dir
  - creates the state directory if missing
  - reads level from `SANDY_LOG_LEVEL` when no argument given
  - unknown level string falls back to `info`
  - level below threshold produces no output

- **format**
  - line starts with ISO 8601 UTC timestamp including milliseconds
  - level column is 5-char padded (`info `, `warn `, `error`, `debug`)
  - message appears immediately after level
  - fields render as `key=value` in insertion order
  - safe values (alphanumeric, `_.:/-`) are not quoted
  - strings with spaces are JSON-quoted
  - numbers and booleans render unquoted
  - objects are JSON-stringified
  - `child()` bindings are merged before per-call fields
  - `Error` value: main line has `key="<message>"`, stack lines follow indented; the duplicate `Error: <message>` first stack frame is not emitted
  - message containing a newline has the newline escaped

- **isLevelEnabled**
  - returns true for levels at or above the threshold
  - returns false for levels below the threshold
  - `noopLogger().isLevelEnabled(x)` is false for every level

- **noopLogger** (existing tests retained, plus)
  - does not create the state directory
  - does not create `mcp.log`

### `src/mcp-server.test.ts`

Replace the JSON-parsing `logLines()` helper with one that parses plain text into `{ timestamp, level, msg, fields }`. The existing test assertions are rewritten in terms of those fields:

- `l.tool === "sandy_run" && l.msg === "invoked"` → `record.fields.tool === "sandy_run" && record.msg === "invoked"`
- `l.level === 50` → `record.level === "error"`
- `l.source === "output" && l.msg === "hello from sandbox"` → `record.fields.source === "output" && record.msg === "hello from sandbox"`

No changes to the logic of the tests, only the parse step.

## Error handling

- `sink.write` or `sink.flush` failures (disk full, permission error) are caught and swallowed. Logging failures must never propagate into MCP tool responses or crash the server. No attempt is made to fall back to stderr (that's where MCP's protocol traffic flows and is captured by the host agent — writing there on every failed log is worse than losing the log line).
- `createLogger` itself does not wrap `mkdirSync` or `Bun.file(...).writer()` in try/catch. If the initial directory or file cannot be opened, the MCP server startup should fail loudly — that's a configuration problem the operator must see.

## Trade-offs

- **Flush on every write** costs one `write` syscall per log line. For the MCP server volume this is immaterial. The alternative (buffered flush) loses tail-of-log lines on crash, which defeats the purpose of the log file.
- **Plain text over JSON** loses structured-ingestion tooling. Accepted — the log is read by humans diagnosing a single MCP server, not aggregated across fleet.
- **No pino-pretty** — accepted; the new format is already readable.
- **Bun-specific API** (`Bun.file().writer()`) ties this to Bun. Sandy already targets Bun exclusively (build, test, runtime), so no portability is lost.

## Migration

One PR on top of the existing `logger` branch:

1. Rewrite `src/logger.ts` — remove pino imports, add the new implementation.
2. Rewrite `src/logger.test.ts` — new format tests, updated createLogger tests.
3. Update the `logLines()` helper and affected assertions in `src/mcp-server.test.ts`.
4. Remove `pino` from `package.json` and run `bun install`.
5. `bun run agent` — lint, format, build, test all pass.
6. Verify the compiled binary now runs: `dist/sandy --help` succeeds.
