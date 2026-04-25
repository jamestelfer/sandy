import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { useTestCwdIsolation } from "../test-support"
import { runSessionCreate } from "./commands/session"

const isolatedCwd = useTestCwdIsolation()

describe("runSessionCreate", () => {
  test("creates a generated session name and returns scripts path", async () => {
    const created = await runSessionCreate()

    expect(created.sessionName).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
    expect(created.scriptsPath).toMatch(/\/scripts$/)
    expect(existsSync(created.scriptsPath)).toBe(true)
  })

  test("creates distinct sessions on repeated calls", async () => {
    const first = await runSessionCreate()
    const second = await runSessionCreate()

    expect(first.sessionName).not.toBe(second.sessionName)
    expect(first.scriptsPath).not.toBe(second.scriptsPath)
    expect(first.scriptsPath.startsWith(join(isolatedCwd.currentDir(), ".sandy"))).toBe(true)
    expect(second.scriptsPath.startsWith(join(isolatedCwd.currentDir(), ".sandy"))).toBe(true)
  })
})
