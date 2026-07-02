import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { makeTmpDir, type TmpDir } from "../resources"
import { listDirIfPresent, readFileIfPresent } from "./fs-read"

let tmp: TmpDir
let dir: string

beforeEach(async () => {
  tmp = await makeTmpDir("sandy-fs-read-")
  dir = tmp.path
})

afterEach(async () => {
  await tmp[Symbol.asyncDispose]()
})

describe("readFileIfPresent", () => {
  it("returns the file contents", async () => {
    const target = path.join(dir, "present.txt")
    await fs.writeFile(target, "hello")
    expect(readFileIfPresent(target, "test file")).toBe("hello")
  })

  it("returns undefined for a missing file", () => {
    expect(readFileIfPresent(path.join(dir, "missing.txt"), "test file")).toBeUndefined()
  })

  it("returns undefined when a parent path segment is a file", async () => {
    const parent = path.join(dir, "not-a-dir")
    await fs.writeFile(parent, "")
    expect(readFileIfPresent(path.join(parent, "child.txt"), "test file")).toBeUndefined()
  })

  it("throws a chained error for other failures", async () => {
    // Reading a directory fails with EISDIR for any user, including root.
    const target = path.join(dir, "actually-a-dir")
    await fs.mkdir(target)

    expect(() => readFileIfPresent(target, "test file")).toThrow(
      /Cannot read test file at .*actually-a-dir/,
    )
    let cause: unknown
    try {
      readFileIfPresent(target, "test file")
    } catch (error) {
      cause = error instanceof Error ? error.cause : undefined
    }
    expect(cause).toBeInstanceOf(Error)
  })
})

describe("listDirIfPresent", () => {
  it("returns directory entries", async () => {
    await fs.mkdir(path.join(dir, "sub"))
    await fs.writeFile(path.join(dir, "file.txt"), "")
    expect(listDirIfPresent(dir, "test dir").sort()).toEqual(["file.txt", "sub"])
  })

  it("returns an empty array for a missing directory", () => {
    expect(listDirIfPresent(path.join(dir, "missing"), "test dir")).toEqual([])
  })

  it("throws a chained error for other failures", () => {
    // A path component over 255 bytes fails with ENAMETOOLONG for any user, including root.
    const target = path.join(dir, "x".repeat(300))

    expect(() => listDirIfPresent(target, "test dir")).toThrow(/Cannot read test dir at/)
  })
})
