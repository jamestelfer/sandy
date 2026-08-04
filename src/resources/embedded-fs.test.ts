import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import tar from "tar-fs"
import {
  copyDirectoryRecursive,
  embeddedPathFromUri,
  extractTarBufferToMemfs,
  getEmbeddedFS,
  listEmbeddedResourceUris,
  makeTmpDir,
  readEmbeddedResource,
} from "."

async function packDirToBuffer(dir: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    tar
      .pack(dir)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", resolve)
      .on("error", reject)
  })
  return Buffer.concat(chunks)
}

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

  test("preserves every file when extracting an archive with many entries", async () => {
    await using srcDir = await makeTmpDir("embedded-fs-scale-")
    const fileCount = 100
    for (let i = 0; i < fileCount; i++) {
      const dir = path.join(srcDir.path, `svc${i}`, "resources")
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, "same.md"), `CONTENT-${i}`)
    }

    const tarBuffer = await packDirToBuffer(srcDir.path)
    const memfs = await extractTarBufferToMemfs(tarBuffer)

    for (let i = 0; i < fileCount; i++) {
      const content = memfs.readFileSync(`/svc${i}/resources/same.md`, "utf-8")
      expect(content).toBe(`CONTENT-${i}`)
    }
  })

  test("sibling subtrees sharing a leaf filename both survive extraction intact", async () => {
    const cli = await readEmbeddedResource("sandy://skills/cli/resources/scripting-guide.md")
    const mcp = await readEmbeddedResource("sandy://skills/mcp/resources/scripting-guide.md")

    expect(cli).not.toBe(mcp)
    expect(cli).toContain("sandy resource sandy://skills/cli")
    expect(mcp).not.toContain("sandy resource sandy://skills/cli")
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
