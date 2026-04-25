import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { extractEmbeddedChecks } from "./checks"
import { Session } from "./session"
import { useTestCwdIsolation } from "./test-tooling/isolated-cwd"

useTestCwdIsolation()

describe("extractEmbeddedChecks", () => {
  test("writes baseline.ts and connect.ts into the given dir", async () => {
    const session = await Session.create()
    await extractEmbeddedChecks(session.scriptsDir)
    const baseline = await readFile(join(session.scriptsDir, "baseline.ts"), "utf8")
    const connect = await readFile(join(session.scriptsDir, "connect.ts"), "utf8")
    expect(baseline.length).toBeGreaterThan(0)
    expect(connect.length).toBeGreaterThan(0)
  })
})
