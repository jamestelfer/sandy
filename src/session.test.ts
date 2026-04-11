import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createSession } from "./session"

const tmpDir = join(import.meta.dir, "../.tmp-test-session")

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true })
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(join(import.meta.dir, ".."))
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("createSession", () => {
  it("returns a lowercase hyphen-separated name when no name given", async () => {
    const { name } = await createSession()
    expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
  })

  it("returns a different name on each call", async () => {
    const a = await createSession()
    const b = await createSession()
    expect(a.name).not.toBe(b.name)
  })

  it("creates .sandy/<name>/ directory", async () => {
    const { name } = await createSession()
    expect(existsSync(join(tmpDir, ".sandy", name))).toBe(true)
  })

  it("creates .sandy/.gitignore with * if absent", async () => {
    await createSession()
    const content = readFileSync(join(tmpDir, ".sandy", ".gitignore"), "utf8")
    expect(content).toBe("*\n")
  })

  it("does not overwrite an existing .sandy/.gitignore", async () => {
    mkdirSync(join(tmpDir, ".sandy"), { recursive: true })
    writeFileSync(join(tmpDir, ".sandy", ".gitignore"), "existing\n")
    await createSession()
    const content = readFileSync(join(tmpDir, ".sandy", ".gitignore"), "utf8")
    expect(content).toBe("existing\n")
  })

  it("uses the provided name when given", async () => {
    const { name, dir } = await createSession("my-session")
    expect(name).toBe("my-session")
    expect(dir).toBe(resolve(tmpDir, ".sandy", "my-session"))
    expect(existsSync(join(tmpDir, ".sandy", "my-session"))).toBe(true)
  })

  it("uses the provided dir when given, ignoring the default .sandy/<name>/ path", async () => {
    const customDir = join(tmpDir, "custom-output")
    const { dir } = await createSession(undefined, customDir)
    expect(dir).toBe(customDir)
    expect(existsSync(customDir)).toBe(true)
  })

  it("still generates a session name when only dir is provided", async () => {
    const customDir = join(tmpDir, "custom-output")
    const { name } = await createSession(undefined, customDir)
    expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
  })
})
