import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import * as path from "node:path"
import {
  copyDirectoryRecursive,
  embeddedPathFromUri,
  getEmbeddedFS,
  listEmbeddedResourceUris,
  readEmbeddedResource,
} from "./embedded-fs"
import { makeTmpDir } from "./tmpdir"

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
    await using destDir = await makeTmpDir("copy-recursive-")
    await copyDirectoryRecursive(memfs, "/bootstrap", destDir.path)
    const original = memfs.readFileSync("/bootstrap/init.sh", "utf-8") as string
    const copied = readFileSync(path.join(destDir.path, "init.sh"), "utf-8")
    expect(copied).toBe(original)
  })

  test("copies nested directory structures", async () => {
    const memfs = await getEmbeddedFS()
    await using destDir = await makeTmpDir("copy-recursive-nested-")
    await copyDirectoryRecursive(memfs, "/skills/mcp", destDir.path)
    const content = readFileSync(path.join(destDir.path, "resources/scripting-guide.md"), "utf-8")
    expect(content).toContain("SANDY_OUTPUT")
  })

  test("throws on missing source path", async () => {
    const memfs = await getEmbeddedFS()
    await using destDir = await makeTmpDir("copy-recursive-missing-")
    await expect(copyDirectoryRecursive(memfs, "/nonexistent", destDir.path)).rejects.toThrow()
  })
})
