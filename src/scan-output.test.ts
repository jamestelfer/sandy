import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { OutputTracker } from "./scan-output"
import { makeTmpDir } from "./tmpdir"

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  await using dir = await makeTmpDir("scan-output-test-")
  await fn(dir.path)
}

describe("OutputTracker", () => {
  test("changed() returns [] when nothing in the dir has changed", async () => {
    await withTmpDir(async (dir) => {
      await fs.writeFile(path.join(dir, "existing.txt"), "x")
      const tracker = await OutputTracker.create(dir)
      expect(await tracker.changed()).toEqual([])
    })
  })

  test("changed() includes a file created after construction", async () => {
    await withTmpDir(async (dir) => {
      const tracker = await OutputTracker.create(dir)
      await fs.writeFile(path.join(dir, "new.txt"), "hello")
      expect(await tracker.changed()).toContain("new.txt")
    })
  })

  test("changed() excludes a pre-existing unmodified file", async () => {
    await withTmpDir(async (dir) => {
      await fs.writeFile(path.join(dir, "old.txt"), "before")
      const tracker = await OutputTracker.create(dir)
      const result = await tracker.changed()
      expect(result).not.toContain("old.txt")
    })
  })

  test("changed() includes a pre-existing file whose mtime is newer than snapshot", async () => {
    await withTmpDir(async (dir) => {
      await fs.writeFile(path.join(dir, "modified.txt"), "before")
      const tracker = await OutputTracker.create(dir)
      // Write again to bump mtime — sleep 1ms to guarantee a newer timestamp
      await Bun.sleep(5)
      await fs.writeFile(path.join(dir, "modified.txt"), "after")
      expect(await tracker.changed()).toContain("modified.txt")
    })
  })

  test("changed() returns files in subdirectories with correct relative paths", async () => {
    await withTmpDir(async (dir) => {
      const tracker = await OutputTracker.create(dir)
      await fs.mkdir(path.join(dir, "sub"), { recursive: true })
      await fs.writeFile(path.join(dir, "sub", "deep.txt"), "x")
      const result = await tracker.changed()
      expect(result).toContain(path.join("sub", "deep.txt"))
    })
  })

  test("constructing on a nonexistent dir does not throw", async () => {
    await expect(OutputTracker.create("/nonexistent/path/abc")).resolves.toBeDefined()
  })

  test("changed() returns [] when dir still does not exist", async () => {
    const tracker = await OutputTracker.create("/nonexistent/path/abc")
    expect(await tracker.changed()).toEqual([])
  })

  test("changed() returns files if dir appears after construction", async () => {
    await using parent = await makeTmpDir("scan-output-late-")
    const dir = path.join(parent.path, "late-dir")
    const tracker = await OutputTracker.create(dir)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, "late.txt"), "x")
    expect(await tracker.changed()).toContain("late.txt")
  })
})
