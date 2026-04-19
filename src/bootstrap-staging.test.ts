import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { stageBootstrapFiles } from "./bootstrap-staging"
import { getEmbeddedFS } from "./embedded-fs"

const noopLogger = () => {}

describe("stageBootstrapFiles", () => {
  test("writes all six bootstrap files into destDir", async () => {
    const tmpDir = path.join(import.meta.dir, "../.tmp-test-bootstrap-staging")
    await fs.mkdir(tmpDir, { recursive: true })
    try {
      await stageBootstrapFiles(tmpDir, noopLogger)

      const expected = [
        "init.sh",
        "node_certs.sh",
        "package.json",
        "tsconfig.json",
        "entrypoint",
        "sandy.ts",
      ]
      for (const name of expected) {
        const stat = await fs.stat(path.join(tmpDir, name))
        expect(stat.isFile()).toBe(true)
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("creates a certs/ subdirectory inside destDir", async () => {
    const tmpDir = path.join(import.meta.dir, "../.tmp-test-bootstrap-staging-certs")
    await fs.mkdir(tmpDir, { recursive: true })
    try {
      await stageBootstrapFiles(tmpDir, noopLogger)
      const stat = await fs.stat(path.join(tmpDir, "certs"))
      expect(stat.isDirectory()).toBe(true)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("resolves without throwing when Netskope cert is absent", async () => {
    const tmpDir = path.join(import.meta.dir, "../.tmp-test-bootstrap-staging-no-cert")
    await fs.mkdir(tmpDir, { recursive: true })
    try {
      await expect(stageBootstrapFiles(tmpDir, noopLogger)).resolves.toBeUndefined()
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("does not write to stderr when a noop logger is supplied", async () => {
    const tmpDir = path.join(import.meta.dir, "../.tmp-test-bootstrap-staging-nolog")
    await fs.mkdir(tmpDir, { recursive: true })
    const stderrLines: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrLines.push(chunk.toString())
      return true
    }
    try {
      await stageBootstrapFiles(tmpDir, noopLogger)
    } finally {
      process.stderr.write = originalWrite
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
    expect(stderrLines.join("")).not.toContain("Netskope")
  })

  test("staged file content matches embedded FS source", async () => {
    const tmpDir = path.join(import.meta.dir, "../.tmp-test-bootstrap-staging-content")
    await fs.mkdir(tmpDir, { recursive: true })
    try {
      await stageBootstrapFiles(tmpDir, noopLogger)
      const memfs = await getEmbeddedFS()
      const embeddedInit = memfs.readFileSync("/bootstrap/init.sh", "utf-8") as string
      const stagedInit = await fs.readFile(path.join(tmpDir, "init.sh"), "utf-8")
      expect(stagedInit).toBe(embeddedInit)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
