# Plan: Extract LineWriter class

> Refactor: remove duplicated Writable writer logic from DockerBackend and expose
> via lazy properties on OutputHandler.

## Architectural decisions

- **New file**: `src/line-writer.ts` — `LineWriter` class lives alongside `output-handler.ts`
- **Extends Writable**: `LineWriter` extends Node's `Writable` so it slots directly into
  `demuxStream` without any wrapper
- **Partial-line buffering**: remainder is carried across `_write` calls and flushed in
  `_final`; this fixes the silent data-loss bug in the current inline writers
- **No dispose**: stream lifecycle (`end()` → `_final` → `finish`) is sufficient; the
  existing `finish`-count pattern in DockerBackend already handles drain correctly
- **Lazy construction**: `OutputHandler.stdoutWriter` and `stderrWriter` are get-only
  properties using `??=`; writers are not allocated until first access

---

## Phase 1: Implement LineWriter

### What to build

A `LineWriter` class in `src/line-writer.ts` that extends `Writable`. It accepts an
`onLine: (line: string) => void` callback. In `_write` it accumulates incoming chunks
into a remainder buffer, splits on `\n`, and calls `onLine` for every complete,
non-empty line (after `trimEnd()`). In `_final` it flushes any non-empty remainder as
a final line, then clears the buffer.

### Acceptance criteria

- [ ] `LineWriter` extends `Writable` and compiles cleanly
- [ ] Single chunk with multiple `\n`-terminated lines: each line delivered once
- [ ] Chunk split across two writes (partial line at end of first chunk): line
      assembled correctly and delivered on second write
- [ ] Chunk ending with `\n`: no phantom empty-string callback
- [ ] Non-empty remainder at stream end (no trailing `\n`): flushed by `_final`
- [ ] Empty lines (blank or whitespace-only) are not delivered to `onLine`
- [ ] Unit tests cover all above cases in `src/line-writer.test.ts`

---

## Phase 2: Expose via OutputHandler and wire into DockerBackend

### What to build

Add two lazy getter properties to `OutputHandler`:

```
get stdoutWriter(): LineWriter  →  new LineWriter((line) => this.stdoutLine(line))
get stderrWriter(): LineWriter  →  new LineWriter((line) => this.stderrLine(line))
```

Each is allocated at most once via `??=` on a private backing field. No `dispose`
method is added — callers end the writers via the Writable stream protocol.

In `DockerBackend.run()`, replace the two inline `new Writable({…})` blocks and the
manual `finishCount` counter with `handler.stdoutWriter` and `handler.stderrWriter`.
The `finish`-count pattern and `demuxStream` call stay unchanged.

### Acceptance criteria

- [ ] `OutputHandler` exports `stdoutWriter` and `stderrWriter` lazy getters
- [ ] Each getter returns the same instance on repeated access
- [ ] `DockerBackend.run()` contains no inline `Writable` construction
- [ ] Existing `OutputHandler` unit tests continue to pass unchanged
- [ ] Existing `DockerBackend` unit tests continue to pass unchanged
- [ ] `bun run agent` passes (lint + format + build + tests)
