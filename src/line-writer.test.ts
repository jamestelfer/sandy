import { describe, expect, test } from "bun:test"
import { LineWriter } from "./output"

function collect(lines: string[]): LineWriter {
  return new LineWriter((line) => lines.push(line))
}

async function write(writer: LineWriter, ...chunks: string[]): Promise<void> {
  for (const chunk of chunks) {
    await new Promise<void>((resolve, reject) =>
      writer.write(Buffer.from(chunk), (err) => (err ? reject(err) : resolve())),
    )
  }
}

async function end(writer: LineWriter): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    writer.end((err?: Error | null) => (err ? reject(err) : resolve())),
  )
}

describe("LineWriter", () => {
  test("single complete line delivered", async () => {
    const lines: string[] = []
    const w = collect(lines)
    await write(w, "hello\n")
    expect(lines).toEqual(["hello"])
  })

  test("multiple lines in one chunk all delivered", async () => {
    const lines: string[] = []
    const w = collect(lines)
    await write(w, "alpha\nbeta\ngamma\n")
    expect(lines).toEqual(["alpha", "beta", "gamma"])
  })

  test("partial line at end of chunk assembled with next chunk", async () => {
    const lines: string[] = []
    const w = collect(lines)
    await write(w, "hel", "lo\n")
    expect(lines).toEqual(["hello"])
  })

  test("trailing newline does not produce empty callback", async () => {
    const lines: string[] = []
    const w = collect(lines)
    await write(w, "line\n")
    await end(w)
    expect(lines).toEqual(["line"])
  })

  test("partial line with no trailing newline flushed on end", async () => {
    const lines: string[] = []
    const w = collect(lines)
    await write(w, "no newline at end")
    await end(w)
    expect(lines).toEqual(["no newline at end"])
  })

  test("blank and whitespace-only lines are not delivered", async () => {
    const lines: string[] = []
    const w = collect(lines)
    await write(w, "first\n\n   \nsecond\n")
    expect(lines).toEqual(["first", "second"])
  })
})

describe("LineWriter.feed / flush", () => {
  test("feed with complete line delivers it synchronously", () => {
    const lines: string[] = []
    const w = new LineWriter((line) => lines.push(line))
    w.feed(Buffer.from("hello\n"))
    expect(lines).toEqual(["hello"])
  })

  test("feed partial then feed rest assembles the line", () => {
    const lines: string[] = []
    const w = new LineWriter((line) => lines.push(line))
    w.feed(Buffer.from("hel"))
    expect(lines).toEqual([])
    w.feed(Buffer.from("lo\n"))
    expect(lines).toEqual(["hello"])
  })

  test("flush delivers non-empty remainder", () => {
    const lines: string[] = []
    const w = new LineWriter((line) => lines.push(line))
    w.feed(Buffer.from("no newline"))
    expect(lines).toEqual([])
    w.flush()
    expect(lines).toEqual(["no newline"])
  })

  test("flush on empty remainder does nothing", () => {
    const lines: string[] = []
    const w = new LineWriter((line) => lines.push(line))
    w.flush()
    expect(lines).toEqual([])
  })
})
