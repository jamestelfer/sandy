import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getEmbeddedFS, makeTmpDir, stageBootstrapFiles } from "."

const noopLogger = () => {}

// Stages the bootstrap tree and runs the staged system/init.sh in place, so the
// script resolves its bootstrap root from its own location. Absolute target
// paths (/workspace, /etc/profile.d) are redirected into temp dirs. Stub `aube`
// and `npm` binaries on PATH record their argv; `aube cache path` prints a temp
// cache dir.
async function stageStubbedInit(root: string) {
  const bootstrapDir = path.join(root, "bootstrap")
  const workspaceDir = path.join(root, "workspace")
  const profileDir = path.join(root, "profile.d")
  const binDir = path.join(root, "bin")
  const cacheDir = path.join(root, "cache")
  const callLog = path.join(root, "calls.log")
  await stageBootstrapFiles(bootstrapDir, noopLogger)
  await Promise.all(
    [workspaceDir, profileDir, binDir, cacheDir].map((d) => fs.mkdir(d, { recursive: true })),
  )

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

  const testInit = path.join(bootstrapDir, "system", "init.sh")
  const init = await fs.readFile(testInit, "utf-8")
  await fs.writeFile(
    testInit,
    init.replaceAll(" /workspace", ` ${workspaceDir}`).replaceAll("/etc/profile.d", profileDir),
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
  return { run, calls, bootstrapDir, workspaceDir, profileDir, cacheDir }
}

describe("stageBootstrapFiles", () => {
  test("writes bootstrap scripts and nested workspace files into destDir", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-")
    await stageBootstrapFiles(tmpDir.path, noopLogger)

    const expected = [
      "system/init.sh",
      "profile/node_certs.sh",
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

  test("staged tree has one directory per image stage plus nothing else", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-stages-")
    await stageBootstrapFiles(tmpDir.path, noopLogger)
    expect((await fs.readdir(tmpDir.path)).sort()).toEqual(["profile", "system", "workspace"])
  })

  test("workspace step copies all runtime files without bootstrap machinery", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-workspace-")
    const { run, bootstrapDir, workspaceDir } = await stageStubbedInit(tmpDir.path)
    await fs.writeFile(path.join(bootstrapDir, "workspace", ".runtime-config"), "runtime")

    expect(await run("workspace")).toBe(0)

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

  test("profiles step copies every profile script and nothing else", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-profiles-")
    const { run, bootstrapDir, profileDir } = await stageStubbedInit(tmpDir.path)

    expect(await run("profiles")).toBe(0)

    const staged = (await fs.readdir(path.join(bootstrapDir, "profile"))).sort()
    expect(staged.length).toBeGreaterThan(0)
    expect((await fs.readdir(profileDir)).sort()).toEqual(staged)
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

  test("creates a system/certs/ subdirectory inside destDir", async () => {
    await using tmpDir = await makeTmpDir("bootstrap-staging-certs-")
    await stageBootstrapFiles(tmpDir.path, noopLogger)
    const stat = await fs.stat(path.join(tmpDir.path, "system", "certs"))
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
    const embeddedInit = memfs.readFileSync("/bootstrap/system/init.sh", "utf-8") as string
    const stagedInit = await fs.readFile(path.join(tmpDir.path, "system", "init.sh"), "utf-8")
    expect(stagedInit).toBe(embeddedInit)
  })
})
