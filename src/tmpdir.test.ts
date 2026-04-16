import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { makeTmpDir } from "./tmpdir"

describe("makeTmpDir", () => {
  test("returns an existing directory under os.tmpdir()", async () => {
    await using dir = await makeTmpDir("sandy-test-")
    const stat = await fs.stat(dir.path)
    expect(stat.isDirectory()).toBe(true)
    expect(dir.path.startsWith(os.tmpdir())).toBe(true)
  })

  test("directory is removed after the using scope exits", async () => {
    let capturedPath: string
    {
      await using dir = await makeTmpDir("sandy-test-")
      capturedPath = dir.path
    }
    await expect(fs.stat(capturedPath)).rejects.toThrow()
  })

  test("dispose is safe when directory has already been removed", async () => {
    const dir = await makeTmpDir("sandy-test-")
    await fs.rm(dir.path, { recursive: true, force: true })
    await expect(dir[Symbol.asyncDispose]()).resolves.toBeUndefined()
  })

  describe("with custom baseDir", () => {
    const customBase = path.resolve(".sandy", "tmp-test")

    afterEach(async () => {
      await fs.rm(customBase, { recursive: true, force: true })
    })

    test("creates directory under the specified base", async () => {
      await using dir = await makeTmpDir("sandy-test-", customBase)
      expect(dir.path.startsWith(customBase)).toBe(true)
      const stat = await fs.stat(dir.path)
      expect(stat.isDirectory()).toBe(true)
    })

    test("creates base directory if it does not exist", async () => {
      await fs.rm(customBase, { recursive: true, force: true }).catch(() => {})
      await using dir = await makeTmpDir("sandy-test-", customBase)
      expect(dir.path.startsWith(customBase)).toBe(true)
    })
  })
})
