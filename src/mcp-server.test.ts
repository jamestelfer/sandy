import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { DummyBackend } from "./dummy-backend"
import { listEmbeddedResourceUris, readEmbeddedResource } from "./embedded-fs"
import { createLogger } from "./logger"
import { handlerProgressCallback, SandyMcpServer } from "./mcp-server"
import { Session } from "./session"
import { useTestCwdIsolation } from "./test-tooling/isolated-cwd"
import type { RunOptions } from "./types"

useTestCwdIsolation()

type RunCall = { method: "run"; opts: RunOptions }

const LOG_FILE_RE = /^mcp\.pid-\d+\.\d{8}-\d{6}\.log$/

function findRun(backend: DummyBackend): RunCall {
  const call = backend.calls.find((c): c is RunCall => c.method === "run")
  if (!call) {
    throw new Error("No run call found")
  }
  return call
}

async function ensureSession(): Promise<Session> {
  return Session.create()
}

async function createSessionScript(scriptName: string): Promise<Session> {
  const session = await Session.create()
  await session.writeScript(scriptName, "console.log('ok')")
  return session
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
    const session = await createSessionScript("foo.ts")

    const result = await server.handleSandyRun({
      session: session.name,
      script: "foo.ts",
      imdsPort: 9001,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("hello")
    expect(result.output).toContain("[err] warn")
    expect(result.sessionName).toBe(session.name)
    const call = findRun(backend)
    expect(call.opts.scriptPath).toBe(join(session.scriptsDir, "foo.ts"))
    expect(call.opts.imdsPort).toBe(9001)
  })

  test("rejects missing session with remediation", async () => {
    await expect(
      server.handleSandyRun({ session: "", script: "foo.ts", imdsPort: 9001 }),
    ).rejects.toThrow("use sandy_create_session")
  })

  test("rejects unknown session with remediation", async () => {
    await expect(
      server.handleSandyRun({ session: "missing-session", script: "foo.ts", imdsPort: 9001 }),
    ).rejects.toThrow("sandy_resume_session")
  })

  test("rejects missing script with full expected path", async () => {
    const session = await ensureSession()

    await expect(
      server.handleSandyRun({ session: session.name, script: "missing.ts", imdsPort: 9001 }),
    ).rejects.toThrow(/expected at .*missing\.ts/)
  })

  test("writes inline content before execution", async () => {
    const session = await ensureSession()

    await server.handleSandyRun({
      session: session.name,
      script: "inline.ts",
      content: "console.log('inline')",
      imdsPort: 9001,
    })

    expect(readFileSync(join(session.scriptsDir, "inline.ts"), "utf-8")).toBe(
      "console.log('inline')",
    )
  })

  test("overwrites inline content on repeated runs", async () => {
    const session = await ensureSession()

    await server.handleSandyRun({
      session: session.name,
      script: "inline.ts",
      content: "console.log('first')",
      imdsPort: 9001,
    })
    await server.handleSandyRun({
      session: session.name,
      script: "inline.ts",
      content: "console.log('second')",
      imdsPort: 9001,
    })

    expect(readFileSync(join(session.scriptsDir, "inline.ts"), "utf-8")).toBe(
      "console.log('second')",
    )
  })

  test("allows parallel runs on the same session", async () => {
    const session = await ensureSession()

    await Promise.all([
      server.handleSandyRun({
        session: session.name,
        script: "parallel-a.ts",
        content: "console.log('a')",
        imdsPort: 9001,
      }),
      server.handleSandyRun({
        session: session.name,
        script: "parallel-b.ts",
        content: "console.log('b')",
        imdsPort: 9001,
      }),
    ])

    const runs = backend.calls.filter((c): c is RunCall => c.method === "run")
    expect(runs.length).toBe(2)
  })
})

describe("session management", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("sandy_create_session returns session name and scripts path", async () => {
    const created = await server.handleCreateSession()

    expect(created.sessionName).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
    expect(created.scriptsPath).toMatch(/\/scripts$/)
  })

  test("sandy_resume_session returns session details for an existing session", async () => {
    const created = await ensureSession()
    const resumed = await server.handleResumeSession(created.name)

    expect(resumed.sessionName).toBe(created.name)
    expect(resumed.scriptsPath).toBe(created.scriptsDir)
  })

  test("sandy_resume_session rejects unknown sessions with remediation", async () => {
    await expect(server.handleResumeSession("missing-session")).rejects.toThrow(
      "sandy_create_session",
    )
  })
})

describe("resources", () => {
  let server: SandyMcpServer

  beforeEach(() => {
    server = new SandyMcpServer(new DummyBackend())
  })

  test("lists embedded MCP resources", async () => {
    const uris = await listEmbeddedResourceUris()

    expect(uris).toContain("sandy://skills/mcp/SKILL.md")
    expect(uris).toContain("sandy://skills/mcp/resources/scripting-guide.md")
  })

  test("reads embedded scripting guide content by URI", async () => {
    const content = await readEmbeddedResource("sandy://skills/mcp/resources/scripting-guide.md")

    expect(content).toContain("async function*")
    expect(content).toContain("SANDY_OUTPUT")
  })

  test("reads embedded example content by URI", async () => {
    const content = await readEmbeddedResource(
      "sandy://skills/mcp/resources/examples/ec2_describe.ts",
    )

    expect(content).toContain("EC2Client")
    expect(content).toContain("DescribeInstancesCommand")
  })

  test("prime returns MCP skill content", async () => {
    const content = await server.handlePrime()

    expect(content).toContain("# Sandy")
    expect(content).toContain("sandy://skills/mcp/resources/scripting-guide.md")
  })
})

describe("sandy_check", () => {
  let backend: DummyBackend
  let server: SandyMcpServer

  beforeEach(() => {
    backend = new DummyBackend()
    server = new SandyMcpServer(backend)
  })

  test("when image does not exist, does not call backend.run()", async () => {
    await server.handleSandyCheck(() => {}, "baseline")
    expect(backend.calls.find((c) => c.method === "run")).toBeUndefined()
  })

  test("when image does not exist, returns non-zero exitCode", async () => {
    const result = await server.handleSandyCheck(() => {}, "baseline")
    expect(result.exitCode).not.toBe(0)
  })

  test("when image does not exist, output directs use of sandy_image tool", async () => {
    const result = await server.handleSandyCheck(() => {}, "baseline")
    expect(result.output).toContain("sandy_image")
  })

  test("baseline dispatches run with staged baseline script path and imdsPort 0", async () => {
    backend.imageExistsResult = true
    await server.handleSandyCheck(() => {}, "baseline")
    const run = findRun(backend)
    expect(run.opts.scriptPath).toMatch(/baseline\.ts$/)
    expect(run.opts.scriptPath).not.toBe("baseline")
    expect(run.opts.imdsPort).toBe(0)
  })

  test("connect dispatches run with staged connect script path and given imdsPort", async () => {
    backend.imageExistsResult = true
    await server.handleSandyCheck(() => {}, "connect", 9001)
    const run = findRun(backend)
    expect(run.opts.scriptPath).toMatch(/connect\.ts$/)
    expect(run.opts.scriptPath).not.toBe("connect")
    expect(run.opts.imdsPort).toBe(9001)
  })

  test("ephemeral session directory is removed after run", async () => {
    backend.imageExistsResult = true
    await server.handleSandyCheck(() => {}, "baseline")
    const run = findRun(backend)
    expect(existsSync(run.opts.sessionDir)).toBe(false)
  })

  test("ephemeral session directory is removed when backend.run throws", async () => {
    backend.imageExistsResult = true
    let captured: { sessionDir: string } | undefined
    backend.run = async (opts) => {
      captured = { sessionDir: opts.sessionDir }
      throw new Error("boom")
    }
    await expect(server.handleSandyCheck(() => {}, "baseline")).rejects.toThrow("boom")
    expect(captured).toBeDefined()
    if (captured) {
      expect(existsSync(captured.sessionDir)).toBe(false)
    }
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
    expect(backend.calls).toContainEqual({ method: "imageDelete", force: false })
  })

  test("delete with force=true passes force=true to backend.imageDelete()", async () => {
    await server.handleSandyImage(() => {}, "delete", true)
    expect(backend.calls).toContainEqual({ method: "imageDelete", force: true })
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
    const session = await createSessionScript("foo.ts")

    await server.handleSandyRun(
      { session: session.name, script: "foo.ts", imdsPort: 9001 },
      (msg) => received.push(msg),
    )

    expect(received).toEqual(["loading resources", "querying ec2"])
  })

  test("handleSandyCheck forwards backend progress via onProgress", async () => {
    backend.imageExistsResult = true
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

describe("logging", () => {
  interface LogRecord {
    timestamp: string
    level: string
    msg: string
    fields: Record<string, string>
    stack: string[]
  }

  const LOG_LINE_RE = /^(?<timestamp>\S+) (?<level>debug|info |warn |error) (?<rest>.*)$/

  function parseLogFile(content: string): LogRecord[] {
    const rawLines = content.split("\n")
    const records: LogRecord[] = []
    let current: LogRecord | null = null
    for (const line of rawLines) {
      if (line.length === 0) {
        continue
      }
      if (line.startsWith("  ")) {
        if (current) {
          current.stack.push(line.slice(2))
        }
        continue
      }
      const match = LOG_LINE_RE.exec(line)
      if (!match?.groups) {
        continue
      }
      const { timestamp, level, rest } = match.groups
      // rest = "<msg> [k=v k=v ...]"
      const fields: Record<string, string> = {}
      const tokens: string[] = []
      let remaining = rest
      while (true) {
        const m = remaining.match(/ ([A-Za-z_][A-Za-z0-9_]*)=((?:"(?:\\.|[^"\\])*")|[^ ]+)$/)
        if (!m) {
          break
        }
        tokens.unshift(m[0])
        remaining = remaining.slice(0, m.index)
      }
      const msg = remaining
      for (const tok of tokens) {
        const kv = tok.match(/ ([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
        if (!kv) {
          continue
        }
        const [, k, vRaw] = kv
        let v = vRaw
        if (v.startsWith(`"`) && v.endsWith(`"`)) {
          try {
            v = JSON.parse(v)
          } catch {
            // leave as-is
          }
        }
        fields[k] = v
      }
      current = { timestamp, level: level.trim(), msg, fields, stack: [] }
      records.push(current)
    }
    return records
  }

  function setup(level: string = "info") {
    const logDir = join(process.cwd(), "mcp-log")
    rmSync(logDir, { recursive: true, force: true })
    mkdirSync(logDir, { recursive: true })
    process.env.XDG_STATE_HOME = logDir

    const logger = createLogger(level)
    const backend = new DummyBackend()
    const server = new SandyMcpServer(backend, logger)

    function logLines(): LogRecord[] {
      const dir = join(logDir, "sandy")
      if (!existsSync(dir)) {
        return []
      }
      const logFile = readdirSync(dir)
        .filter((name) => LOG_FILE_RE.test(name))
        .map((name) => join(dir, name))[0]
      if (!logFile) {
        return []
      }
      return parseLogFile(readFileSync(logFile, "utf-8"))
    }

    return { backend, server, logDir, logLines }
  }

  afterEach(() => {
    delete process.env.XDG_STATE_HOME
  })

  test("handleSandyRun logs invocation and completion", async () => {
    const { server, logLines } = setup()
    const session = await createSessionScript("foo.ts")
    await server.handleSandyRun({ session: session.name, script: "foo.ts", imdsPort: 9001 })

    const logs = logLines()
    expect(logs.some((l) => l.fields.tool === "sandy_run" && l.msg === "invoked")).toBe(true)
    expect(logs.some((l) => l.fields.tool === "sandy_run" && l.msg === "complete")).toBe(true)
  })

  test("handleSandyImage logs invocation and completion (action create)", async () => {
    const { server, logLines } = setup()
    await server.handleSandyImage(() => {}, "create")

    const logs = logLines()
    expect(logs.some((l) => l.fields.tool === "sandy_image" && l.msg === "invoked")).toBe(true)
    expect(logs.some((l) => l.fields.tool === "sandy_image" && l.msg === "complete")).toBe(true)
  })

  test("handleSandyCheck logs invocation and completion (imageExistsResult = true)", async () => {
    const { backend, server, logLines } = setup()
    backend.imageExistsResult = true
    await server.handleSandyCheck(() => {}, "baseline")

    const logs = logLines()
    expect(logs.some((l) => l.fields.tool === "sandy_check" && l.msg === "invoked")).toBe(true)
    expect(logs.some((l) => l.fields.tool === "sandy_check" && l.msg === "complete")).toBe(true)
  })

  test("handleSandyCheck logs error when no image found (imageExistsResult = false)", async () => {
    const { backend, server, logLines } = setup()
    backend.imageExistsResult = false
    await server.handleSandyCheck(() => {}, "baseline")

    const logs = logLines()
    expect(logs.some((l) => l.msg === "no image found" && l.level === "error")).toBe(true)
  })

  test("handler error is logged before re-throwing", async () => {
    const { server, logLines } = setup()

    await expect(
      server.handleSandyRun({ session: "", script: "foo.ts", imdsPort: 9001 }),
    ).rejects.toThrow(/session is required/)

    const logs = logLines()
    expect(logs.some((l) => l.fields.tool === "sandy_run" && l.level === "error")).toBe(true)
  })

  test("output lines logged at debug level when logger level is debug", async () => {
    const { backend, server, logLines } = setup("debug")
    backend.stdoutLines = ["hello from sandbox"]
    const session = await createSessionScript("foo.ts")

    await server.handleSandyRun({ session: session.name, script: "foo.ts", imdsPort: 9001 })

    const lines = logLines()
    expect(lines.some((l) => l.fields.source === "output" && l.msg === "hello from sandbox")).toBe(
      true,
    )
  })

  test("output lines not logged when logger level is info", async () => {
    const { backend, server, logLines } = setup("info")
    backend.stdoutLines = ["hello from sandbox"]
    const session = await createSessionScript("foo.ts")

    await server.handleSandyRun({ session: session.name, script: "foo.ts", imdsPort: 9001 })

    const lines = logLines()
    expect(lines.some((l) => l.fields.source === "output")).toBe(false)
  })

  test("handleResumeSession logs session resume requested", async () => {
    const { server, logLines } = setup()
    const session = await ensureSession()
    await server.handleResumeSession(session.name)

    const logs = logLines()
    expect(
      logs.some((l) => l.msg === "session resume requested" && l.fields.session === session.name),
    ).toBe(true)
  })
})
