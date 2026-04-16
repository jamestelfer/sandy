import { describe, expect, test } from "bun:test"
import { LineWriter } from "./line-writer"
import { OutputHandler } from "./output-handler"

describe("OutputHandler", () => {
  test("stdoutLine accumulates line in output", () => {
    const handler = new OutputHandler(() => {})
    handler.stdoutLine("hello")
    expect(handler.output).toBe("hello\n")
  })

  test("stderrLine accumulates line with [err] prefix in output", () => {
    const handler = new OutputHandler(() => {})
    handler.stderrLine("oops")
    expect(handler.output).toBe("[err] oops\n")
  })

  test("[-->] stdout line fires onProgress with extracted message", () => {
    const messages: string[] = []
    const handler = new OutputHandler((msg) => messages.push(msg))
    handler.stdoutLine("[-->  compiling...")
    expect(messages).toEqual(["compiling..."])
  })

  test("non-progress stdout line does not fire onProgress", () => {
    const messages: string[] = []
    const handler = new OutputHandler((msg) => messages.push(msg))
    handler.stdoutLine("normal output")
    expect(messages).toEqual([])
  })

  test("stdoutLine writes non-progress line to injected write function", () => {
    const written: string[] = []
    const handler = new OutputHandler(
      () => {},
      (line) => written.push(line),
    )
    handler.stdoutLine("hello")
    expect(written).toEqual(["hello"])
  })

  test("stdoutLine does not write progress line to injected write function", () => {
    const written: string[] = []
    const handler = new OutputHandler(
      () => {},
      (line) => written.push(line),
    )
    handler.stdoutLine("[-->  compiling...")
    expect(written).toEqual([])
  })

  test("stderrLine writes [err]-prefixed line to injected write function", () => {
    const written: string[] = []
    const handler = new OutputHandler(
      () => {},
      (line) => written.push(line),
    )
    handler.stderrLine("oops")
    expect(written).toEqual(["[err] oops"])
  })

  test("stdoutWriter is a LineWriter that routes lines through stdoutLine", async () => {
    const handler = new OutputHandler(() => {})
    const w = handler.stdoutWriter
    expect(w).toBeInstanceOf(LineWriter)
    await new Promise<void>((resolve) => w.write(Buffer.from("written\n"), resolve))
    expect(handler.output).toBe("written\n")
  })

  test("stdoutWriter returns same instance on repeated access", () => {
    const handler = new OutputHandler(() => {})
    expect(handler.stdoutWriter).toBe(handler.stdoutWriter)
  })

  test("stderrWriter is a LineWriter that routes lines through stderrLine", async () => {
    const handler = new OutputHandler(() => {})
    const w = handler.stderrWriter
    expect(w).toBeInstanceOf(LineWriter)
    await new Promise<void>((resolve) => w.write(Buffer.from("oops\n"), resolve))
    expect(handler.output).toBe("[err] oops\n")
  })

  test("stderrWriter returns same instance on repeated access", () => {
    const handler = new OutputHandler(() => {})
    expect(handler.stderrWriter).toBe(handler.stderrWriter)
  })

  test("feedStdout delivers complete line into output", () => {
    const handler = new OutputHandler(() => {})
    handler.feedStdout(Buffer.from("hello\n"))
    expect(handler.output).toBe("hello\n")
  })

  test("feedStdout partial line then flush delivers line into output", () => {
    const handler = new OutputHandler(() => {})
    handler.feedStdout(Buffer.from("partial"))
    expect(handler.output).toBe("")
    handler.flush()
    expect(handler.output).toBe("partial\n")
  })

  test("feedStderr delivers line with [err] prefix", () => {
    const handler = new OutputHandler(() => {})
    handler.feedStderr(Buffer.from("oops\n"))
    expect(handler.output).toBe("[err] oops\n")
  })

  test("feedStderr partial line then flush delivers [err]-prefixed line", () => {
    const handler = new OutputHandler(() => {})
    handler.feedStderr(Buffer.from("half"))
    expect(handler.output).toBe("")
    handler.flush()
    expect(handler.output).toBe("[err] half\n")
  })

  test("flush on handler with no feed calls does nothing", () => {
    const handler = new OutputHandler(() => {})
    expect(() => handler.flush()).not.toThrow()
    expect(handler.output).toBe("")
  })

  test("feedStdout fires onProgress for [-->-prefixed lines", () => {
    const messages: string[] = []
    const handler = new OutputHandler((msg) => messages.push(msg))
    handler.feedStdout(Buffer.from("[-->  compiling...\n"))
    expect(messages).toEqual(["compiling..."])
  })
})
