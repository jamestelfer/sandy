import { describe, test, expect, beforeEach } from "bun:test"
import { DummyBackend } from "./dummy-backend"
import { SandyMcpServer } from "./mcp-server"

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
    const call = backend.calls.find((c) => c.method === "run")
    expect(call).toBeDefined()
    expect((call as { method: "run"; opts: import("./types").RunOptions }).opts.scriptPath).toBe(
      "foo.ts",
    )
    expect((call as { method: "run"; opts: import("./types").RunOptions }).opts.imdsPort).toBe(9001)
  })
})
