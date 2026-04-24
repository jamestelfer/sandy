import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { extractBuiltinChecks } from "./check-scripts"
import { getEmbeddedFS } from "./embedded-fs"
import { useTestCwdIsolation } from "./test-tooling/isolated-cwd"

const isolatedCwd = useTestCwdIsolation()

describe("extractBuiltinChecks", () => {
  test("creates a temp dir under CWD and stages baseline.ts", async () => {
    await using dir = await extractBuiltinChecks()
    expect(dir.path.startsWith(`${isolatedCwd.currentDir()}${path.sep}`)).toBe(true)
    const content = await fs.readFile(path.join(dir.path, "baseline.ts"), "utf8")
    expect(content).toContain("Baseline checks complete")
  })

  test("stages connect.ts", async () => {
    await using dir = await extractBuiltinChecks()
    const content = await fs.readFile(path.join(dir.path, "connect.ts"), "utf8")
    expect(content).toContain("EC2Client")
  })

  test("extracts all check scripts into the temp dir", async () => {
    await using dir = await extractBuiltinChecks()
    const files = await fs.readdir(dir.path)
    expect(files).toContain("baseline.ts")
    expect(files).toContain("connect.ts")
  })

  test("temp dir is removed on disposal", async () => {
    let extractedPath = ""
    {
      await using dir = await extractBuiltinChecks()
      extractedPath = dir.path
      const stat = await fs.stat(extractedPath)
      expect(stat.isDirectory()).toBe(true)
    }
    await expect(fs.stat(extractedPath)).rejects.toThrow()
  })

  test("baseline script content matches embedded FS source", async () => {
    await using dir = await extractBuiltinChecks()
    const staged = await fs.readFile(path.join(dir.path, "baseline.ts"), "utf8")
    const memfs = await getEmbeddedFS()
    const embedded = memfs.readFileSync("/checks/baseline.ts", "utf-8") as string
    expect(staged).toBe(embedded)
  })
})
