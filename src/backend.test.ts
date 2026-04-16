import { describe, expect, it } from "bun:test"
import { DummyBackend } from "./dummy-backend"
import { OutputHandler } from "./output-handler"
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
    await backend.imageCreate(new OutputHandler(() => {}))
    expect(backend.calls).toEqual([{ method: "imageCreate" }])
  })

  it("records imageDelete call", async () => {
    const backend = new DummyBackend()
    await backend.imageDelete(new OutputHandler(() => {}))
    expect(backend.calls).toEqual([{ method: "imageDelete", force: false }])
  })

  it("records imageDelete call with force=true when passed", async () => {
    const backend = new DummyBackend()
    await backend.imageDelete(new OutputHandler(() => {}), true)
    expect(backend.calls).toEqual([{ method: "imageDelete", force: true }])
  })

  it("returns false for imageExists by default", async () => {
    const backend = new DummyBackend()
    expect(await backend.imageExists(new OutputHandler(() => {}))).toBe(false)
  })

  it("returns configured imageExists value", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    expect(await backend.imageExists(new OutputHandler(() => {}))).toBe(true)
  })

  it("records run call with opts", async () => {
    const backend = new DummyBackend()
    await backend.run(testOpts, new OutputHandler(() => {}))
    expect(backend.calls).toEqual([{ method: "run", opts: testOpts }])
  })

  it("calls onProgress for each configured progress line from imageCreate", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["line 1", "line 2"]
    const received: string[] = []
    await backend.imageCreate(new OutputHandler((msg) => received.push(msg)))
    expect(received).toEqual(["line 1", "line 2"])
  })

  it("calls onProgress for each configured progress line from imageDelete", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["line 1", "line 2"]
    const received: string[] = []
    await backend.imageDelete(new OutputHandler((msg) => received.push(msg)))
    expect(received).toEqual(["line 1", "line 2"])
  })

  it("imageExists is a silent probe — does not fire onProgress", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["line 1", "line 2"]
    const received: string[] = []
    await backend.imageExists(new OutputHandler((msg) => received.push(msg)))
    expect(received).toEqual([])
  })

  it("calls onProgress for each configured progress line", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["line 1", "line 2"]
    const received: string[] = []
    await backend.run(testOpts, new OutputHandler((msg) => received.push(msg)))
    expect(received).toEqual(["line 1", "line 2"])
  })

  it("returns configured RunResult", async () => {
    const backend = new DummyBackend()
    backend.runResult = { exitCode: 1, output: "out", outputFiles: ["a.json"] }
    const result = await backend.run(testOpts, new OutputHandler(() => {}))
    expect(result).toEqual({ exitCode: 1, output: "out", outputFiles: ["a.json"] })
  })

  it("each instance starts with empty calls", async () => {
    const a = new DummyBackend()
    const b = new DummyBackend()
    await a.imageCreate(() => {})
    expect(b.calls).toEqual([])
  })
})
