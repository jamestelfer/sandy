import { describe, test, expect, beforeEach } from "bun:test"
import { DummyBackend } from "./dummy-backend"
import { SandyMcpServer, handlerProgressCallback } from "./mcp-server"
import type { RunOptions } from "./types"

type RunCall = { method: "run"; opts: RunOptions }

function findRun(backend: DummyBackend): RunCall {
  const call = backend.calls.find((c): c is RunCall => c.method === "run")
  if (!call) {
    throw new Error("No run call found")
  }
  return call
}

describe("sandy_run", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("dispatches to backend and returns structured result", async () => {
    backend.runResult = { exitCode: 0, output: "hello\n[err] warn\n", outputFiles: [] }

    const result = await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("hello")
    expect(result.output).toContain("[err] warn")
    expect(result.sessionName).toBeTruthy()
    const call = findRun(backend)
    expect(call.opts.scriptPath).toBe("foo.ts")
    expect(call.opts.imdsPort).toBe(9001)
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

  test("sandy_resume_session sets active session name without validation", async () => {
    server.handleResumeSession("my-custom-session")
    const result = await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

    expect(result.sessionName).toBe("my-custom-session")
    const run = findRun(backend)
    expect(run.opts.session).toBe("my-custom-session")
  })

  test("activeSession reset after resume does not reuse the resumed name", async () => {
    server.handleResumeSession("session-a")
    await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

    // Force-clear activeSession without a new handleResumeSession call, simulating an
    // internal reset (error recovery, reconnect, etc.) that bypasses handleResumeSession.
    // Without the fix, resumedName is still "session-a" and would be reused.
    ;(server as unknown as { activeSession: null }).activeSession = null

    const result = await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 })

    expect(result.sessionName).not.toBe("session-a")
  })
})

describe("resources", () => {
  let server: SandyMcpServer

  beforeEach(() => {
    server = new SandyMcpServer(new DummyBackend())
  })

  test("scripting-guide resource returns embedded content", () => {
    const content = server.handleScriptingGuideResource()
    expect(content).toContain("async function*")
    expect(content).toContain("SANDY_OUTPUT")
  })

  test("examples resource returns ec2_describe content", () => {
    const content = server.handleExampleResource("ec2_describe")
    expect(content).toContain("EC2Client")
    expect(content).toContain("DescribeInstancesCommand")
  })

  test("examples resource returns ecs_services content", () => {
    const content = server.handleExampleResource("ecs_services")
    expect(content).toContain("ECSClient")
    expect(content).toContain("ListServicesCommand")
  })

  test("examples resource throws for unknown name", () => {
    expect(() => server.handleExampleResource("unknown")).toThrow()
  })
})

describe("sandy_check", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("baseline dispatches run with __baseline__ scriptPath and imdsPort 0", async () => {
    await server.handleSandyCheck(() => {}, "baseline")
    const run = findRun(backend)
    expect(run.opts.scriptPath).toBe("__baseline__")
    expect(run.opts.imdsPort).toBe(0)
  })

  test("connect dispatches run with __connect__ scriptPath and given imdsPort", async () => {
    await server.handleSandyCheck(() => {}, "connect", 9001)
    const run = findRun(backend)
    expect(run.opts.scriptPath).toBe("__connect__")
    expect(run.opts.imdsPort).toBe(9001)
  })
})

describe("sandy_image", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("create dispatches to backend.imageCreate()", async () => {
    await server.handleSandyImage(() => {}, "create")
    expect(backend.calls).toContainEqual({ method: "imageCreate" })
  })

  test("delete dispatches to backend.imageDelete()", async () => {
    await server.handleSandyImage(() => {}, "delete")
    expect(backend.calls).toContainEqual({ method: "imageDelete" })
  })
})

describe("progress", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("handleSandyRun forwards backend progress via onProgress", async () => {
    backend.progressLines = ["loading resources", "querying ec2"]
    const received: string[] = []

    await server.handleSandyRun({ script: "foo.ts", imdsPort: 9001 }, (msg) => received.push(msg))

    expect(received).toEqual(["loading resources", "querying ec2"])
  })

  test("handleSandyCheck forwards backend progress via onProgress", async () => {
    backend.progressLines = ["checking IMDS"]
    const received: string[] = []

    await server.handleSandyCheck((msg) => received.push(msg), "baseline")

    expect(received).toEqual(["checking IMDS"])
  })

  test("handleSandyImage forwards backend progress on create", async () => {
    backend.progressLines = ["pulling base image", "installing node"]
    const received: string[] = []

    await server.handleSandyImage((msg) => received.push(msg), "create")

    expect(received).toEqual(["pulling base image", "installing node"])
  })

  test("handleSandyImage forwards backend progress on delete", async () => {
    backend.progressLines = ["removing image"]
    const received: string[] = []

    await server.handleSandyImage((msg) => received.push(msg), "delete")

    expect(received).toEqual(["removing image"])
  })
})

// Fake RequestHandlerExtra with just the fields handlerProgressCallback uses.
function makeHandlerContext(progressToken?: string | number) {
  const sent: { method: string; params: object }[] = []
  const ctx = {
    _meta: progressToken !== undefined ? { progressToken } : {},
    sendNotification: async (n: { method: string; params: object }) => {
      sent.push(n)
    },
  }
  return { ctx, sent }
}

describe("handlerProgressCallback", () => {
  test("returns a no-op when no progressToken", async () => {
    const { ctx, sent } = makeHandlerContext()
    const cb = handlerProgressCallback(ctx as Parameters<typeof handlerProgressCallback>[0])

    await cb("ignored message")

    expect(sent).toHaveLength(0)
  })

  test("sends notifications/progress with the token and message", async () => {
    const { ctx, sent } = makeHandlerContext("my-token")
    const cb = handlerProgressCallback(ctx as Parameters<typeof handlerProgressCallback>[0])

    await cb("step one")

    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      method: "notifications/progress",
      params: { progressToken: "my-token", progress: 1, message: "step one" },
    })
  })

  test("increments the progress counter on each call", async () => {
    const { ctx, sent } = makeHandlerContext("tok")
    const cb = handlerProgressCallback(ctx as Parameters<typeof handlerProgressCallback>[0])

    await cb("a")
    await cb("b")
    await cb("c")

    expect(sent.map((n) => (n.params as { progress: number }).progress)).toEqual([1, 2, 3])
  })

  test("numeric progressToken is preserved in notifications", async () => {
    const { ctx, sent } = makeHandlerContext(42)
    const cb = handlerProgressCallback(ctx as Parameters<typeof handlerProgressCallback>[0])

    await cb("msg")

    expect((sent[0]?.params as { progressToken: unknown }).progressToken).toBe(42)
  })
})
