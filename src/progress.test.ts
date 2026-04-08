import { describe, expect, it } from "bun:test"
import { parseProgressLine } from "./progress"

describe("parseProgressLine", () => {
  it("detects a progress line", () => {
    const result = parseProgressLine("[-->  hello world")
    expect(result.isProgress).toBe(true)
    expect(result.message).toBe("hello world")
  })

  it("passes through normal output", () => {
    const result = parseProgressLine("normal output line")
    expect(result.isProgress).toBe(false)
  })

  it("handles bare prefix with no message", () => {
    const result = parseProgressLine("[-->")
    expect(result.isProgress).toBe(true)
    expect(result.message).toBe("")
  })

  it("handles prefix with only whitespace after it", () => {
    const result = parseProgressLine("[-->   ")
    expect(result.isProgress).toBe(true)
    expect(result.message).toBe("")
  })

  it("does not match prefix mid-line", () => {
    const result = parseProgressLine("prefix [-->  not progress")
    expect(result.isProgress).toBe(false)
  })
})
