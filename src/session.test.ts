import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createSession, validateSessionName } from "./session"
import { useIsolatedCwd } from "./test-cwd"

const isolatedCwd = useIsolatedCwd()

describe("validateSessionName", () => {
  it("accepts valid humanId-style names", () => {
    expect(() => validateSessionName("quick-brown-fox")).not.toThrow()
    expect(() => validateSessionName("ab-cd")).not.toThrow()
  })

  it("rejects path traversal attempts", () => {
    expect(() => validateSessionName("../../.ssh")).toThrow("invalid session name")
    expect(() => validateSessionName("../evil")).toThrow("invalid session name")
  })

  it("rejects names with slashes", () => {
    expect(() => validateSessionName("foo/bar")).toThrow("invalid session name")
    expect(() => validateSessionName("/etc/shadow")).toThrow("invalid session name")
  })

  it("rejects single-word names (must match humanId two-word minimum)", () => {
    expect(() => validateSessionName("singleword")).toThrow("invalid session name")
  })

  it("rejects empty string", () => {
    expect(() => validateSessionName("")).toThrow("invalid session name")
  })
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

  it("creates <name>/ directory under CWD", async () => {
    const { name } = await createSession()
    expect(existsSync(join(isolatedCwd.currentDir(), name))).toBe(true)
  })

  it("creates .gitignore with * if absent", async () => {
    await createSession()
    const content = readFileSync(join(isolatedCwd.currentDir(), ".gitignore"), "utf8")
    expect(content).toBe("*\n")
  })

  it("does not overwrite an existing .gitignore", async () => {
    writeFileSync(join(isolatedCwd.currentDir(), ".gitignore"), "existing\n")
    await createSession()
    const content = readFileSync(join(isolatedCwd.currentDir(), ".gitignore"), "utf8")
    expect(content).toBe("existing\n")
  })

  it("rejects path traversal in provided name", async () => {
    await expect(createSession("../../.ssh")).rejects.toThrow("invalid session name")
  })

  it("uses the provided name when given", async () => {
    const { name, dir } = await createSession("my-session")
    expect(name).toBe("my-session")
    expect(dir).toBe(resolve(isolatedCwd.currentDir(), "my-session"))
    expect(existsSync(join(isolatedCwd.currentDir(), "my-session"))).toBe(true)
  })

  it("uses the provided dir when given, ignoring the default <name>/ path", async () => {
    const customDir = join(isolatedCwd.currentDir(), "custom-output")
    const { dir } = await createSession(undefined, customDir)
    expect(dir).toBe(customDir)
    expect(existsSync(customDir)).toBe(true)
  })

  it("still generates a session name when only dir is provided", async () => {
    const customDir = join(isolatedCwd.currentDir(), "custom-output")
    const { name } = await createSession(undefined, customDir)
    expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
  })
})
