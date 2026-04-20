import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { resolveScriptDir } from "./check-scripts"
import { getEmbeddedFS } from "./embedded-fs"

describe("resolveScriptDir", () => {
  test("baseline creates a temp dir containing the baseline script", async () => {
    await using dir = await resolveScriptDir("baseline")
    const content = await fs.readFile(path.join(dir.path, "baseline.ts"), "utf8")
    expect(content).toContain("Baseline checks complete")
  })

  test("connect creates a temp dir containing the connect script", async () => {
    await using dir = await resolveScriptDir("connect")
    const content = await fs.readFile(path.join(dir.path, "connect.ts"), "utf8")
    expect(content).toContain("EC2Client")
  })

  test("extracts all check scripts into the temp dir", async () => {
    await using dir = await resolveScriptDir("baseline")
    const files = await fs.readdir(dir.path)
    expect(files).toContain("baseline.ts")
    expect(files).toContain("connect.ts")
  })

  test("real script path returns dirname without creating a temp dir", async () => {
    await using dir = await resolveScriptDir("/some/path/myscript.ts")
    expect(dir.path).toBe("/some/path")
  })

  test("temp dir for builtin checks is removed on disposal", async () => {
    let tmpPath: string
    {
      await using dir = await resolveScriptDir("baseline")
      tmpPath = dir.path
      const stat = await fs.stat(tmpPath)
      expect(stat.isDirectory()).toBe(true)
    }
    await expect(fs.stat(tmpPath)).rejects.toThrow()
  })

  test("real path disposal is a no-op — parent dir is not removed", async () => {
    const scriptPath = "/some/real/script.ts"
    await using dir = await resolveScriptDir(scriptPath)
    expect(dir.path).toBe("/some/real")
  })

  test("baseline script content matches embedded FS source", async () => {
    await using dir = await resolveScriptDir("baseline")
    const staged = await fs.readFile(path.join(dir.path, "baseline.ts"), "utf8")
    const memfs = await getEmbeddedFS()
    const embedded = memfs.readFileSync("/checks/baseline.ts", "utf-8") as string
    expect(staged).toBe(embedded)
  })
})
