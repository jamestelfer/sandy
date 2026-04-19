import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  copyDirectoryRecursive,
  embeddedPathFromUri,
  getEmbeddedFS,
  listEmbeddedResourceUris,
  readEmbeddedResource,
} from "./embedded-fs"

describe("embedded filesystem", () => {
  test("memoises initialisation promise", () => {
    const first = getEmbeddedFS()
    const second = getEmbeddedFS()

    expect(first).toBe(second)
  })

  test("lists embedded resources as sandy:// URIs", async () => {
    const uris = await listEmbeddedResourceUris()

    expect(uris).toContain("sandy://skills/cli/SKILL.md")
    expect(uris).toContain("sandy://skills/mcp/SKILL.md")
  })

  test("reads resource content by URI", async () => {
    const content = await readEmbeddedResource("sandy://skills/mcp/resources/scripting-guide.md")

    expect(content).toContain("SANDY_OUTPUT")
  })

  test("rejects non-sandy URIs", () => {
    expect(() => embeddedPathFromUri("https://example.com/file.md")).toThrow(
      "resource URI must start with sandy://",
    )
  })

  test("normalises URI path", () => {
    expect(embeddedPathFromUri("sandy://skills/mcp/SKILL.md")).toBe("skills/mcp/SKILL.md")
    expect(embeddedPathFromUri("sandy:///skills/mcp/SKILL.md")).toBe("skills/mcp/SKILL.md")
  })
})

describe("copyDirectoryRecursive", () => {
  test("copies files preserving content exactly", async () => {
    const memfs = await getEmbeddedFS()
    const destDir = path.join(import.meta.dir, "../.tmp-test-copy-recursive")
    await fs.mkdir(destDir, { recursive: true })
    try {
      await copyDirectoryRecursive(memfs, "/bootstrap", destDir)
      const original = memfs.readFileSync("/bootstrap/init.sh", "utf-8") as string
      const copied = readFileSync(path.join(destDir, "init.sh"), "utf-8")
      expect(copied).toBe(original)
    } finally {
      await fs.rm(destDir, { recursive: true, force: true })
    }
  })

  test("copies nested directory structures", async () => {
    const memfs = await getEmbeddedFS()
    const destDir = path.join(import.meta.dir, "../.tmp-test-copy-recursive-nested")
    await fs.mkdir(destDir, { recursive: true })
    try {
      await copyDirectoryRecursive(memfs, "/skills/mcp", destDir)
      const content = readFileSync(path.join(destDir, "resources/scripting-guide.md"), "utf-8")
      expect(content).toContain("SANDY_OUTPUT")
    } finally {
      await fs.rm(destDir, { recursive: true, force: true })
    }
  })

  test("throws on missing source path", async () => {
    const memfs = await getEmbeddedFS()
    const destDir = path.join(import.meta.dir, "../.tmp-test-copy-recursive-missing")
    await fs.mkdir(destDir, { recursive: true })
    try {
      await expect(copyDirectoryRecursive(memfs, "/nonexistent", destDir)).rejects.toThrow()
    } finally {
      await fs.rm(destDir, { recursive: true, force: true })
    }
  })
})
