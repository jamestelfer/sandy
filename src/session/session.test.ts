import { describe, expect, it } from "bun:test"
import { existsSync, symlinkSync, writeFileSync } from "node:fs"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { useTestCwdIsolation } from "../test-support"
import { Session } from "."

const isolatedCwd = useTestCwdIsolation()

describe("Session", () => {
  describe("create", () => {
    it("generates a humanId-shaped name and creates dir/scripts/output", async () => {
      const session = await Session.create()
      expect(session.name).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
      expect(session.dir).toBe(join(isolatedCwd.currentDir(), session.name))
      expect(session.scriptsDir).toBe(join(session.dir, "scripts"))
      expect(session.outputDir).toBe(join(session.dir, "output"))
      expect(existsSync(session.scriptsDir)).toBe(true)
      expect(existsSync(session.outputDir)).toBe(true)
    })

    it("returns a different name on each call", async () => {
      const a = await Session.create()
      const b = await Session.create()
      expect(a.name).not.toBe(b.name)
    })

    it("captures baseDir at construction — later chdir does not move the session", async () => {
      const session = await Session.create()
      const originalDir = session.dir
      const tmp = await mkdtemp(join(tmpdir(), "other-"))
      process.chdir(tmp)
      expect(session.dir).toBe(originalDir)
    })
  })

  describe("ephemeral", () => {
    it("returns a disposable session whose dir is removed on scope exit", async () => {
      let dirDuring = ""
      {
        await using session = await Session.ephemeral()
        dirDuring = session.dir
        expect(existsSync(dirDuring)).toBe(true)
      }
      expect(existsSync(dirDuring)).toBe(false)
    })

    it("explicit delete also removes the dir", async () => {
      const session = await Session.ephemeral()
      const dir = session.dir
      await session.delete()
      expect(existsSync(dir)).toBe(false)
    })
  })

  describe("resume", () => {
    it("returns a Session for an existing session dir", async () => {
      const created = await Session.create()
      const resumed = await Session.resume(created.name)
      expect(resumed.name).toBe(created.name)
      expect(resumed.dir).toBe(created.dir)
    })

    it("throws when the session dir does not exist", async () => {
      await expect(Session.resume("never-was-here")).rejects.toThrow(/session not found/)
    })

    it("throws on invalid name format", async () => {
      await expect(Session.resume("../../.ssh")).rejects.toThrow(/invalid session name/)
    })

    it("rejects single-word names", async () => {
      await expect(Session.resume("singleword")).rejects.toThrow(/invalid session name/)
    })

    it("rejects empty name", async () => {
      await expect(Session.resume("")).rejects.toThrow(/invalid session name/)
    })

    it("describes expected format for invalid names", async () => {
      await expect(Session.resume("invalid")).rejects.toThrow(
        /expected lowercase hyphen-separated words/,
      )
    })
  })

  describe("resolveScript", () => {
    it("returns absolute path for a valid script", async () => {
      const session = await Session.create()
      await session.writeScript("hello.ts", "console.log('ok')")
      expect(await session.resolveScript("hello.ts")).toBe(join(session.scriptsDir, "hello.ts"))
    })

    it("rejects paths escaping the scripts dir", async () => {
      const session = await Session.create()
      await expect(session.resolveScript("../escape.ts")).rejects.toThrow(
        /must be within the session scripts directory/,
      )
    })

    it("throws if the script is missing", async () => {
      const session = await Session.create()
      await expect(session.resolveScript("missing.ts")).rejects.toThrow(/script not found/)
    })

    it("rejects symlinks", async () => {
      const session = await Session.create()
      const outside = join(session.dir, "outside.ts")
      writeFileSync(outside, "console.log('x')")
      symlinkSync(outside, join(session.scriptsDir, "linked.ts"))
      await expect(session.resolveScript("linked.ts")).rejects.toThrow(/must not be a symlink/)
    })
  })

  describe("writeScript", () => {
    it("writes content and returns absolute path", async () => {
      const session = await Session.create()
      const path = await session.writeScript("a/b.ts", "console.log('nested')")
      expect(path).toBe(join(session.scriptsDir, "a", "b.ts"))
      expect(await readFile(path, "utf8")).toBe("console.log('nested')")
    })

    it("rejects paths escaping the scripts dir", async () => {
      const session = await Session.create()
      await expect(session.writeScript("../../escape.ts", "x")).rejects.toThrow(
        /must be within the session scripts directory/,
      )
    })

    it("refuses to overwrite a symlink", async () => {
      const session = await Session.create()
      const outside = join(session.dir, "outside.ts")
      writeFileSync(outside, "x")
      symlinkSync(outside, join(session.scriptsDir, "linked.ts"))
      await expect(session.writeScript("linked.ts", "new")).rejects.toThrow(/must not be a symlink/)
    })
  })
})
