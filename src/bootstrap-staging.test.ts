import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { stageBootstrapFiles } from "./bootstrap-staging"

describe("stageBootstrapFiles", () => {
  test("writes all six bootstrap files into destDir", async () => {
    const tmpDir = path.join(import.meta.dir, "../.tmp-test-bootstrap-staging")
    await fs.mkdir(tmpDir, { recursive: true })
    try {
      await stageBootstrapFiles(tmpDir)

      const expected = ["init.sh", "node_certs.sh", "package.json", "tsconfig.json", "entrypoint", "sandy.ts"]
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
      await stageBootstrapFiles(tmpDir)
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
      await expect(stageBootstrapFiles(tmpDir)).resolves.toBeUndefined()
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
