import { describe, expect, it } from "bun:test"
import { parseProgressLine } from "."

describe("parseProgressLine", () => {
  it("detects a progress line", () => {
    const result = parseProgressLine("[-->  hello world")
    expect(result).toEqual({ isProgress: true, message: "hello world" })
  })

  it("passes through normal output", () => {
    const result = parseProgressLine("normal output line")
    expect(result.isProgress).toBe(false)
  })

  it("handles bare prefix with no message", () => {
    const result = parseProgressLine("[-->")
    expect(result).toEqual({ isProgress: true, message: "" })
  })

  it("handles prefix with only whitespace after it", () => {
    const result = parseProgressLine("[-->   ")
    expect(result).toEqual({ isProgress: true, message: "" })
  })

  it("does not match prefix mid-line", () => {
    const result = parseProgressLine("prefix [-->  not progress")
    expect(result.isProgress).toBe(false)
  })
})
