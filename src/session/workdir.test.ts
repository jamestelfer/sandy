import { beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs"
import * as os from "node:os"
import { join, resolve } from "node:path"
import { useTestCwdIsolation } from "../test-support"
import { establishWorkDir } from "."

const isolatedCwd = useTestCwdIsolation()
let root = ""

beforeEach(() => {
  root = join(isolatedCwd.currentDir(), "workdir")
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  process.chdir(root)
})

describe("establishWorkDir", () => {
  it("uses .sandy under original CWD when writable", async () => {
    await establishWorkDir()

    expect(process.cwd()).toBe(resolve(root, ".sandy"))
    expect(existsSync(resolve(root, ".sandy"))).toBe(true)
  })

  it("writes .gitignore with '*' when establishing the workdir", async () => {
    await establishWorkDir()
    const gitignore = join(process.cwd(), ".gitignore")
    expect(existsSync(gitignore)).toBe(true)
    expect(readFileSync(gitignore, "utf8")).toBe("*\n")
  })

  it("falls back to $TMPDIR/sandy/<hash> when .sandy under original CWD is not writable", async () => {
    const roParent = join(root, "readonly")
    mkdirSync(roParent, { recursive: true })
    chmodSync(roParent, 0o555)
    process.chdir(roParent)

    try {
      await establishWorkDir()
      const escapedTmp = realpathSync(os.tmpdir()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      expect(process.cwd()).toMatch(new RegExp(`^${escapedTmp}/sandy/[A-Za-z0-9_-]{16}$`))
    } finally {
      chmodSync(roParent, 0o755)
    }
  })

  it("throws when neither .sandy nor tmp fallback is writable", async () => {
    const roParent = join(root, "readonly")
    mkdirSync(roParent, { recursive: true })
    chmodSync(roParent, 0o555)
    process.chdir(roParent)

    const originalTmp = process.env.TMPDIR
    const blockedTmp = join(root, "blocked-tmp")
    mkdirSync(blockedTmp, { recursive: true })
    chmodSync(blockedTmp, 0o555)
    process.env.TMPDIR = blockedTmp

    try {
      await expect(establishWorkDir()).rejects.toThrow(
        "unable to establish sandy working directory",
      )
    } finally {
      process.env.TMPDIR = originalTmp
      chmodSync(roParent, 0o755)
      chmodSync(blockedTmp, 0o755)
    }
  })
})
