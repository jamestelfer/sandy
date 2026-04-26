import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getEmbeddedFS, makeTmpDir, stageBootstrapFiles } from "."

const noopLogger = () => {}

describe("stageBootstrapFiles", () => {
  test("writes all six bootstrap files into destDir", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-")
    await stageBootstrapFiles(tmpDir.path, noopLogger)

    const expected = [
      "init.sh",
      "node_certs.sh",
      "package.json",
      "tsconfig.json",
      "entrypoint",
      "sandy.ts",
    ]
    for (const name of expected) {
      const stat = await fs.stat(path.join(tmpDir.path, name))
      expect(stat.isFile()).toBe(true)
    }
  })

  test("creates a certs/ subdirectory inside destDir", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-certs-")
    await stageBootstrapFiles(tmpDir.path, noopLogger)
    const stat = await fs.stat(path.join(tmpDir.path, "certs"))
    expect(stat.isDirectory()).toBe(true)
  })

  test("resolves without throwing when Netskope cert is absent", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-no-cert-")
    await expect(stageBootstrapFiles(tmpDir.path, noopLogger)).resolves.toBeUndefined()
  })

  test("does not write to stderr when a noop logger is supplied", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-nolog-")
    const stderrLines: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrLines.push(chunk.toString())
      return true
    }
    try {
      await stageBootstrapFiles(tmpDir.path, noopLogger)
    } finally {
      process.stderr.write = originalWrite
    }
    expect(stderrLines.join("")).not.toContain("Netskope")
  })

  test("staged file content matches embedded FS source", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-content-")
    await stageBootstrapFiles(tmpDir.path, noopLogger)
    const memfs = await getEmbeddedFS()
    const embeddedInit = memfs.readFileSync("/bootstrap/init.sh", "utf-8") as string
    const stagedInit = await fs.readFile(path.join(tmpDir.path, "init.sh"), "utf-8")
    expect(stagedInit).toBe(embeddedInit)
  })
})
