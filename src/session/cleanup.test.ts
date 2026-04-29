import { describe, expect, it } from "bun:test"
import { existsSync, utimesSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { makeTmpDir } from "../resources/tmpdir"
import { cleanupStaleSessions } from "./cleanup"

const STALE_DATE = new Date(Date.now() - 49 * 60 * 60 * 1000)
const RECENT_DATE = new Date(Date.now() - 1 * 60 * 60 * 1000)

async function makeSessionDir(base: string, name: string): Promise<string> {
  const dir = join(base, name)
  await mkdir(join(dir, "scripts"), { recursive: true })
  await mkdir(join(dir, "output"), { recursive: true })
  return dir
}

describe("cleanupStaleSessions", () => {
  it("deletes a stale empty session directory and returns 1", async () => {
    await using tmp = await makeTmpDir("cleanup-test-")
    const sessionDir = await makeSessionDir(tmp.path, "quick-brown-fox")
    utimesSync(sessionDir, STALE_DATE, STALE_DATE)

    const count = await cleanupStaleSessions(tmp.path)

    expect(count).toBe(1)
    expect(existsSync(sessionDir)).toBe(false)
  })

  it("leaves a recent empty session directory untouched and returns 0", async () => {
    await using tmp = await makeTmpDir("cleanup-test-")
    const sessionDir = await makeSessionDir(tmp.path, "quick-brown-fox")
    utimesSync(sessionDir, RECENT_DATE, RECENT_DATE)

    const count = await cleanupStaleSessions(tmp.path)

    expect(count).toBe(0)
    expect(existsSync(sessionDir)).toBe(true)
  })

  it("leaves a stale session directory that contains a file and returns 0", async () => {
    await using tmp = await makeTmpDir("cleanup-test-")
    const sessionDir = await makeSessionDir(tmp.path, "quick-brown-fox")
    await writeFile(join(sessionDir, "scripts", "run.ts"), "// script")
    utimesSync(sessionDir, STALE_DATE, STALE_DATE)

    const count = await cleanupStaleSessions(tmp.path)

    expect(count).toBe(0)
    expect(existsSync(sessionDir)).toBe(true)
  })

  it("ignores directories whose name does not match the session name pattern and returns 0", async () => {
    await using tmp = await makeTmpDir("cleanup-test-")
    const ignoredDir = join(tmp.path, "node_modules")
    await mkdir(ignoredDir, { recursive: true })
    utimesSync(ignoredDir, STALE_DATE, STALE_DATE)

    const count = await cleanupStaleSessions(tmp.path)

    expect(count).toBe(0)
    expect(existsSync(ignoredDir)).toBe(true)
  })

  it("deletes multiple stale empty sessions and returns the count", async () => {
    await using tmp = await makeTmpDir("cleanup-test-")
    const a = await makeSessionDir(tmp.path, "alpha-bravo")
    const b = await makeSessionDir(tmp.path, "charlie-delta")
    utimesSync(a, STALE_DATE, STALE_DATE)
    utimesSync(b, STALE_DATE, STALE_DATE)

    const count = await cleanupStaleSessions(tmp.path)

    expect(count).toBe(2)
    expect(existsSync(a)).toBe(false)
    expect(existsSync(b)).toBe(false)
  })

  it("returns 0 without error when baseDir does not exist", async () => {
    const count = await cleanupStaleSessions("/tmp/sandy-nonexistent-base-dir-abc123")

    expect(count).toBe(0)
  })
})
