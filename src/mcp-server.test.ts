import { describe, test, expect, beforeEach } from "bun:test"
import { DummyBackend } from "./dummy-backend"
import { SandyMcpServer } from "./mcp-server"
import type { RunOptions } from "./types"

type RunCall = { method: "run"; opts: RunOptions }

describe("sandy_run", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("dispatches to backend and returns structured result", async () => {
    backend.runResult = { exitCode: 0, stdout: "hello", stderr: "warn", outputFiles: [] }

    const result = await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("hello")
    expect(result.stderr).toBe("warn")
    expect(result.sessionName).toBeTruthy()
    const call = backend.calls.find((c) => c.method === "run") as RunCall | undefined
    expect(call).toBeDefined()
    expect(call!.opts.scriptPath).toBe("foo.ts")
    expect(call!.opts.imdsPort).toBe(9001)
  })
})

describe("session management", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("session auto-created once and reused on subsequent sandy_run calls", async () => {
    await server.handleSandyRun({ script: "a.ts", imdsPort: 9001 })
    await server.handleSandyRun({ script: "b.ts", imdsPort: 9001 })

    const runs = backend.calls.filter((c): c is RunCall => c.method === "run")
    expect(runs.length).toBe(2)
    expect(runs[0].opts.session).toBe(runs[1].opts.session)
    expect(runs[0].opts.sessionDir).toBe(runs[1].opts.sessionDir)
  })
})
