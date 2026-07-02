import { describe, expect, it } from "bun:test"
import { describeError, errorCode } from "./errors"

describe("errorCode", () => {
  it("extracts the code from an errno-style error", () => {
    const err = Object.assign(new Error("boom"), { code: "EACCES" })
    expect(errorCode(err)).toBe("EACCES")
  })

  it("returns undefined for errors without a string code", () => {
    expect(errorCode(new Error("plain"))).toBeUndefined()
    expect(errorCode(Object.assign(new Error("numeric"), { code: 13 }))).toBeUndefined()
  })

  it("returns undefined for non-Error values", () => {
    expect(errorCode("ENOENT")).toBeUndefined()
    expect(errorCode(undefined)).toBeUndefined()
    expect(errorCode({ code: "ENOENT" })).toBeUndefined()
  })
})

describe("describeError", () => {
  it("renders the cause chain as a single line", () => {
    const inner = new Error("EACCES: permission denied")
    const outer = new Error("Cannot read Docker contexts", { cause: inner })
    expect(describeError(outer)).toBe("Cannot read Docker contexts: EACCES: permission denied")
  })

  it("stringifies non-Error values", () => {
    expect(describeError("thrown string")).toBe("thrown string")
    expect(describeError(42)).toBe("42")
  })

  it("caps recursion on cyclic causes", () => {
    const err = new Error("loop")
    err.cause = err
    expect(describeError(err)).toContain("loop")
  })
})
