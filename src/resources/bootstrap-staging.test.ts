import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getEmbeddedFS, makeTmpDir, stageBootstrapFiles } from "."

const noopLogger = () => {}

describe("stageBootstrapFiles", () => {
  test("writes bootstrap scripts and nested workspace files into destDir", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-")
    await stageBootstrapFiles(tmpDir.path, noopLogger)

    const expected = [
      "init.sh",
      "node_certs.sh",
      "workspace/package.json",
      "workspace/aube-workspace.yaml",
      "workspace/tsconfig.json",
      "workspace/entrypoint",
      "workspace/sandy.ts",
    ]
    for (const name of expected) {
      const stat = await fs.stat(path.join(tmpDir.path, name))
      expect(stat.isFile()).toBe(true)
    }
  })

  test("workspace step copies all runtime files without bootstrap machinery", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-workspace-")
    const bootstrapDir = path.join(tmpDir.path, "bootstrap")
    const workspaceDir = path.join(tmpDir.path, "workspace")
    await stageBootstrapFiles(bootstrapDir, noopLogger)
    await fs.writeFile(path.join(bootstrapDir, "workspace", ".runtime-config"), "runtime")

    const init = await fs.readFile(path.join(bootstrapDir, "init.sh"), "utf-8")
    const testInit = path.join(tmpDir.path, "init.sh")
    await fs.writeFile(
      testInit,
      init.replaceAll("/tmp/bootstrap", bootstrapDir).replaceAll(" /workspace", ` ${workspaceDir}`),
    )
    const process = Bun.spawn(["sh", testInit, "workspace"], { stdout: "pipe", stderr: "pipe" })
    expect(await process.exited).toBe(0)

    expect((await fs.readdir(workspaceDir)).sort()).toEqual([
      ".runtime-config",
      "aube-workspace.yaml",
      "entrypoint",
      "package.json",
      "sandy.ts",
      "tsconfig.json",
    ])
    for (const name of await fs.readdir(workspaceDir)) {
      expect(await fs.readFile(path.join(workspaceDir, name), "utf-8")).toBe(
        await fs.readFile(path.join(bootstrapDir, "workspace", name), "utf-8"),
      )
    }
    const entrypoint = await fs.stat(path.join(workspaceDir, "entrypoint"))
    expect(entrypoint.mode & 0o111).toBe(0o111)
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
