import { describe, expect, it } from "bun:test"
import { DummyBackend } from "./dummy-backend"
import type { RunOptions } from "./types"

const testOpts: RunOptions = {
  scriptPath: "foo.ts",
  imdsPort: 9001,
  session: "test-session",
  sessionDir: ".sandy/test-session",
}

describe("DummyBackend", () => {
  it("records imageCreate call", async () => {
    const backend = new DummyBackend()
    await backend.imageCreate()
    expect(backend.calls).toEqual([{ method: "imageCreate" }])
  })

  it("records imageDelete call", async () => {
    const backend = new DummyBackend()
    await backend.imageDelete()
    expect(backend.calls).toEqual([{ method: "imageDelete" }])
  })

  it("returns false for imageExists by default", async () => {
    const backend = new DummyBackend()
    expect(await backend.imageExists()).toBe(false)
  })

  it("returns configured imageExists value", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    expect(await backend.imageExists()).toBe(true)
  })

  it("records run call with opts", async () => {
    const backend = new DummyBackend()
    await backend.run(testOpts, () => {})
    expect(backend.calls).toEqual([{ method: "run", opts: testOpts }])
  })

  it("calls onProgress for each configured progress line", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["line 1", "line 2"]
    const received: string[] = []
    await backend.run(testOpts, (msg) => received.push(msg))
    expect(received).toEqual(["line 1", "line 2"])
  })

  it("returns configured RunResult", async () => {
    const backend = new DummyBackend()
    backend.runResult = { exitCode: 1, stdout: "out", stderr: "err", outputFiles: ["a.json"] }
    const result = await backend.run(testOpts, () => {})
    expect(result).toEqual({ exitCode: 1, stdout: "out", stderr: "err", outputFiles: ["a.json"] })
  })

  it("each instance starts with empty calls", async () => {
    const a = new DummyBackend()
    const b = new DummyBackend()
    await a.imageCreate()
    expect(b.calls).toEqual([])
  })
})
