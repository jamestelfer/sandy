import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getEmbeddedFS, makeTmpDir, stageBootstrapFiles } from "."

const noopLogger = () => {}

// Stages init.sh against temp dirs with stub `aube` and `npm` binaries on PATH.
// Stubs record their argv; `aube cache path` prints a temp cache dir.
async function stageStubbedInit(root: string) {
  const bootstrapDir = path.join(root, "bootstrap")
  const workspaceDir = path.join(root, "workspace")
  const binDir = path.join(root, "bin")
  const cacheDir = path.join(root, "cache")
  const callLog = path.join(root, "calls.log")
  await stageBootstrapFiles(bootstrapDir, noopLogger)
  await Promise.all([workspaceDir, binDir, cacheDir].map((d) => fs.mkdir(d, { recursive: true })))

  for (const name of ["aube", "npm"]) {
    const stub = path.join(binDir, name)
    await fs.writeFile(
      stub,
      [
        "#!/bin/sh",
        `echo "${name} $*" >> "${callLog}"`,
        `if [ "$1 $2" = "cache path" ]; then echo "${cacheDir}"; fi`,
        "",
      ].join("\n"),
    )
    await fs.chmod(stub, 0o755)
  }

  const init = await fs.readFile(path.join(bootstrapDir, "init.sh"), "utf-8")
  const testInit = path.join(root, "init.sh")
  await fs.writeFile(
    testInit,
    init.replaceAll("/tmp/bootstrap", bootstrapDir).replaceAll(" /workspace", ` ${workspaceDir}`),
  )

  const run = async (step: string) => {
    const proc = Bun.spawn(["sh", testInit, step], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      stdout: "pipe",
      stderr: "pipe",
    })
    return proc.exited
  }
  const calls = async () => (await fs.readFile(callLog, "utf-8")).trim().split("\n")
  return { run, calls, cacheDir }
}

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

  test("dependencies step removes the full packument cache and keeps the virtual store", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-dependencies-")
    const { run, calls, cacheDir } = await stageStubbedInit(tmpDir.path)
    await fs.mkdir(path.join(cacheDir, "packuments-full-v1", "origin-x"), { recursive: true })
    await fs.writeFile(path.join(cacheDir, "packuments-full-v1", "origin-x", "a.json"), "{}")
    await fs.mkdir(path.join(cacheDir, "virtual-store", "v1"), { recursive: true })

    expect(await run("dependencies")).toBe(0)

    expect(await calls()).toEqual(["aube install", "aube cache path"])
    expect(await fs.readdir(cacheDir)).toEqual(["virtual-store"])
  })

  test("aube step clears the npm cache after the global install", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-aube-")
    const { run, calls } = await stageStubbedInit(tmpDir.path)

    expect(await run("aube")).toBe(0)

    expect(await calls()).toEqual([
      "npm install -g --ignore-scripts=false @endevco/aube@latest",
      "npm cache clean --force",
    ])
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
