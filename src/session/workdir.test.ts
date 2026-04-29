import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
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

  describe("stale session cleanup", () => {
    const STALE_DATE = new Date(Date.now() - 49 * 60 * 60 * 1000)
    const RECENT_DATE = new Date(Date.now() - 1 * 60 * 60 * 1000)
    const origStderrWrite = process.stderr.write.bind(process.stderr)
    let stderrOutput: string[]

    beforeEach(() => {
      stderrOutput = []
      process.stderr.write = ((chunk: string | Uint8Array) => {
        if (typeof chunk === "string") {
          stderrOutput.push(chunk)
        }
        return origStderrWrite(chunk as string)
      }) as unknown as typeof process.stderr.write
    })

    afterEach(() => {
      process.stderr.write = origStderrWrite
    })

    function makeSession(baseDir: string, name: string): string {
      const dir = join(baseDir, name)
      mkdirSync(join(dir, "scripts"), { recursive: true })
      mkdirSync(join(dir, "output"), { recursive: true })
      return dir
    }

    it("removes a stale empty session when establishing workdir", async () => {
      const sandy = join(root, ".sandy")
      const sessionDir = makeSession(sandy, "quick-brown-fox")
      utimesSync(sessionDir, STALE_DATE, STALE_DATE)

      await establishWorkDir()

      expect(existsSync(sessionDir)).toBe(false)
    })

    it("leaves a stale session that contains a file", async () => {
      const sandy = join(root, ".sandy")
      const sessionDir = makeSession(sandy, "quick-brown-fox")
      writeFileSync(join(sessionDir, "scripts", "run.ts"), "// script")
      utimesSync(sessionDir, STALE_DATE, STALE_DATE)

      await establishWorkDir()

      expect(existsSync(sessionDir)).toBe(true)
    })

    it("leaves a recent empty session", async () => {
      const sandy = join(root, ".sandy")
      const sessionDir = makeSession(sandy, "quick-brown-fox")
      utimesSync(sessionDir, RECENT_DATE, RECENT_DATE)

      await establishWorkDir()

      expect(existsSync(sessionDir)).toBe(true)
    })

    it("writes a cleanup message to stderr when stale sessions are removed", async () => {
      const sandy = join(root, ".sandy")
      const sessionDir = makeSession(sandy, "quick-brown-fox")
      utimesSync(sessionDir, STALE_DATE, STALE_DATE)

      await establishWorkDir()

      expect(stderrOutput.join("")).toContain("cleaned up 1 stale empty sessions")
    })

    it("writes no cleanup message when nothing is cleaned up", async () => {
      await establishWorkDir()

      expect(stderrOutput.join("")).not.toContain("stale empty sessions")
    })
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
