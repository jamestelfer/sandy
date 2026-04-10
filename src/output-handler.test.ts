import { describe, expect, test } from "bun:test"
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

  test("stdoutLine writes raw line to injected write function", () => {
    const written: string[] = []
    const handler = new OutputHandler(
      () => {},
      (line) => written.push(line),
    )
    handler.stdoutLine("hello")
    expect(written).toEqual(["hello"])
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
})
