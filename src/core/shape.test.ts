import { describe, expect, it } from "bun:test"
import { shape } from "./shape"

describe("shape.isObject", () => {
  it("accepts objects, arrays and class instances", () => {
    expect(shape.isObject({})).toBe(true)
    expect(shape.isObject([])).toBe(true)
    expect(shape.isObject(new Error("x"))).toBe(true)
  })

  it("rejects null, primitives and functions", () => {
    expect(shape.isObject(null)).toBe(false)
    expect(shape.isObject(undefined)).toBe(false)
    expect(shape.isObject("text")).toBe(false)
    expect(shape.isObject(() => {})).toBe(false)
  })
})

describe("shape.is", () => {
  it("matches typeof names", () => {
    expect(shape.is("text", "string")).toBe(true)
    expect(shape.is(1, "number")).toBe(true)
    expect(shape.is(() => {}, "function")).toBe(true)
    expect(shape.is(1, "string")).toBe(false)
  })

  it("excludes null from object", () => {
    expect(shape.is({}, "object")).toBe(true)
    expect(shape.is(null, "object")).toBe(false)
  })
})

describe("shape.has", () => {
  it("accepts a present field of the given type", () => {
    expect(shape.has({ code: "EACCES" }, "code", "string")).toBe(true)
  })

  it("rejects a missing or mistyped field", () => {
    expect(shape.has({}, "code", "string")).toBe(false)
    expect(shape.has({ code: 13 }, "code", "string")).toBe(false)
  })

  it("rejects non-objects", () => {
    expect(shape.has(null, "code", "string")).toBe(false)
    expect(shape.has("code", "length", "number")).toBe(false)
  })

  it("sees inherited members", () => {
    expect(shape.has(new Error("x"), "toString", "function")).toBe(true)
  })

  it("preserves earlier narrowing", () => {
    const err: unknown = Object.assign(new Error("boom"), { code: "EACCES" })
    if (err instanceof Error && shape.has(err, "code", "string")) {
      expect(`${err.message}:${err.code}`).toBe("boom:EACCES")
    } else {
      throw new Error("expected narrowing to succeed")
    }
  })
})

describe("shape.get", () => {
  it("returns a field of the given type", () => {
    expect(shape.get({ stream: "line" }, "stream", "string")).toBe("line")
  })

  it("returns undefined for a missing or mistyped field", () => {
    expect(shape.get({}, "stream", "string")).toBeUndefined()
    expect(shape.get({ stream: 1 }, "stream", "string")).toBeUndefined()
  })

  it("returns undefined for non-objects, so calls nest", () => {
    expect(shape.get(null, "stream", "string")).toBeUndefined()
    const meta = { Endpoints: { docker: { Host: "tcp://h:2376" } } }
    const docker = shape.get(shape.get(meta, "Endpoints", "object"), "docker", "object")
    expect(shape.get(docker, "Host", "string")).toBe("tcp://h:2376")
    expect(shape.get(shape.get({}, "Endpoints", "object"), "docker", "object")).toBeUndefined()
  })
})

describe("shape.of", () => {
  const isEntry = shape.of({ name: "string", isDirectory: "function", "size?": "number" })

  it("accepts values with every required field", () => {
    expect(isEntry({ name: "a", isDirectory: () => false })).toBe(true)
    expect(isEntry({ name: "a", isDirectory: () => false, size: 1 })).toBe(true)
  })

  it("rejects a missing or mistyped required field", () => {
    expect(isEntry({ isDirectory: () => false })).toBe(false)
    expect(isEntry({ name: 1, isDirectory: () => false })).toBe(false)
  })

  it("rejects a mistyped optional field", () => {
    expect(isEntry({ name: "a", isDirectory: () => false, size: "1" })).toBe(false)
  })

  it("rejects non-objects", () => {
    expect(isEntry(null)).toBe(false)
    expect(isEntry("a")).toBe(false)
  })

  it("narrows to the declared fields", () => {
    const value: unknown = { name: "a", isDirectory: () => true, size: 2 }
    if (isEntry(value)) {
      expect([value.name, value.isDirectory(), value.size]).toEqual(["a", true, 2])
    } else {
      throw new Error("expected narrowing to succeed")
    }
  })
})
