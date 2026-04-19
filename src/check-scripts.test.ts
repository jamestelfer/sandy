import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { resolveScriptDir } from "./check-scripts"
import { getEmbeddedFS } from "./embedded-fs"

describe("resolveScriptDir", () => {
  test("__baseline__ creates a temp dir containing the baseline script", async () => {
    await using dir = await resolveScriptDir("__baseline__")
    const content = await fs.readFile(path.join(dir.path, "__baseline__.ts"), "utf8")
    expect(content).toContain("Baseline checks complete")
  })

  test("__connect__ creates a temp dir containing the connect script", async () => {
    await using dir = await resolveScriptDir("__connect__")
    const content = await fs.readFile(path.join(dir.path, "__connect__.ts"), "utf8")
    expect(content).toContain("EC2Client")
  })

  test("real script path returns dirname without creating a temp dir", async () => {
    await using dir = await resolveScriptDir("/some/path/myscript.ts")
    expect(dir.path).toBe("/some/path")
  })

  test("temp dir for magic paths is removed on disposal", async () => {
    let tmpPath: string
    {
      await using dir = await resolveScriptDir("__baseline__")
      tmpPath = dir.path
      // dir exists inside the block
      const stat = await fs.stat(tmpPath)
      expect(stat.isDirectory()).toBe(true)
    }
    // after disposal it should be gone
    await expect(fs.stat(tmpPath)).rejects.toThrow()
  })

  test("real path disposal is a no-op — parent dir is not removed", async () => {
    const scriptPath = "/some/real/script.ts"
    await using dir = await resolveScriptDir(scriptPath)
    // disposal must not throw and must not remove anything
    expect(dir.path).toBe("/some/real")
  })

  test("baseline script content matches embedded FS source", async () => {
    await using dir = await resolveScriptDir("__baseline__")
    const staged = await fs.readFile(path.join(dir.path, "__baseline__.ts"), "utf8")
    const memfs = await getEmbeddedFS()
    const embedded = memfs.readFileSync("/checks/baseline.ts", "utf-8") as string
    expect(staged).toBe(embedded)
  })
})
