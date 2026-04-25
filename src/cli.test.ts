import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import yargs from "yargs"
import { runBaseline, runConnect } from "./cli/check"
import { runConfig } from "./cli/config"
import { runImage } from "./cli/image"
import { runMcp } from "./cli/mcp"
import { makeRunCommand, runRun } from "./cli/run"
import { DummyBackend } from "./dummy-backend"
import { noopLogger } from "./logger"
import { Session } from "./session"
import { useTestCwdIsolation } from "./test-tooling/isolated-cwd"
import { establishWorkDir } from "./workdir"

const isolatedCwd = useTestCwdIsolation()

beforeEach(() => {
  process.env.XDG_CONFIG_HOME = isolatedCwd.currentDir()
})

afterEach(() => {
  delete process.env.XDG_CONFIG_HOME
})

describe("CLI config", () => {
  it("reads and returns the current backend (default shuru)", async () => {
    const output: string[] = []
    await runConfig({ docker: false, shuru: false }, (line) => output.push(line))
    expect(output.join("\n")).toContain("shuru")
  })

  it("--shuru flag writes shuru config", async () => {
    const output: string[] = []
    await runConfig({ docker: false, shuru: true }, (line) => output.push(line))
    expect(output.join("\n")).toContain("shuru")
    const verify: string[] = []
    await runConfig({ docker: false, shuru: false }, (line) => verify.push(line))
    expect(verify.join("\n")).toContain("shuru")
  })

  it("--docker flag writes docker config", async () => {
    const output: string[] = []
    await runConfig({ docker: true, shuru: false }, (line) => output.push(line))
    expect(output.join("\n")).toContain("docker")
    const verify: string[] = []
    await runConfig({ docker: false, shuru: false }, (line) => verify.push(line))
    expect(verify.join("\n")).toContain("docker")
  })
})

describe("CLI image", () => {
  it("create dispatches to backend.imageCreate()", async () => {
    const backend = new DummyBackend()
    await runImage({ action: "create" }, backend)
    expect(backend.calls).toEqual([{ method: "imageCreate" }])
  })

  it("delete dispatches to backend.imageDelete()", async () => {
    const backend = new DummyBackend()
    await runImage({ action: "delete" }, backend)
    expect(backend.calls).toEqual([{ method: "imageDelete", force: false }])
  })

  it("delete with force:true passes force=true to backend.imageDelete()", async () => {
    const backend = new DummyBackend()
    await runImage({ action: "delete", force: true }, backend)
    expect(backend.calls).toEqual([{ method: "imageDelete", force: true }])
  })

  it("forwards onProgress callback to backend.imageCreate()", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["step one"]
    const received: string[] = []
    await runImage({ action: "create" }, backend, (msg) => received.push(msg))
    expect(received).toEqual(["step one"])
  })

  it("forwards onProgress callback to backend.imageDelete()", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["step one"]
    const received: string[] = []
    await runImage({ action: "delete" }, backend, (msg) => received.push(msg))
    expect(received).toEqual(["step one"])
  })

  it("writes 'image created' to stderr after imageCreate completes", async () => {
    const backend = new DummyBackend()
    const stderrLines: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrLines.push(chunk.toString())
      return true
    }
    try {
      await runImage({ action: "create" }, backend)
    } finally {
      process.stderr.write = originalWrite
    }
    expect(stderrLines.join("")).toContain("image created")
  })

  it("writes 'image deleted' to stderr after imageDelete completes", async () => {
    const backend = new DummyBackend()
    const stderrLines: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrLines.push(chunk.toString())
      return true
    }
    try {
      await runImage({ action: "delete" }, backend)
    } finally {
      process.stderr.write = originalWrite
    }
    expect(stderrLines.join("")).toContain("image deleted")
  })
})

describe("CLI check", () => {
  it("when image does not exist, baseline does not call backend.run()", async () => {
    const backend = new DummyBackend()
    const prevExitCode = process.exitCode
    try {
      await runBaseline(backend)
      expect(backend.calls.find((c) => c.method === "run")).toBeUndefined()
    } finally {
      process.exitCode = prevExitCode ?? 0
    }
  })

  it("when image does not exist, baseline sets exit code 1", async () => {
    const backend = new DummyBackend()
    const prevExitCode = process.exitCode
    try {
      await runBaseline(backend)
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = prevExitCode ?? 0
    }
  })

  it("when image does not exist, baseline writes message directing image create to stderr", async () => {
    const backend = new DummyBackend()
    const prevExitCode = process.exitCode
    const stderrLines: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrLines.push(chunk.toString())
      return true
    }
    try {
      await runBaseline(backend)
      expect(stderrLines.join("")).toContain("image create")
    } finally {
      process.stderr.write = originalWrite
      process.exitCode = prevExitCode ?? 0
    }
  })

  it("when image does not exist, connect does not call backend.run()", async () => {
    const backend = new DummyBackend()
    const prevExitCode = process.exitCode
    try {
      await runConnect({ imdsPort: 9001, region: "us-west-2" }, backend)
      expect(backend.calls.find((c) => c.method === "run")).toBeUndefined()
    } finally {
      process.exitCode = prevExitCode ?? 0
    }
  })

  it("baseline dispatches to backend.run() with extracted script path", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    await runBaseline(backend)
    const runCall = backend.calls.find((c) => c.method === "run")
    expect(runCall).toBeDefined()
    if (runCall?.method === "run") {
      expect(runCall.opts.scriptPath).toMatch(/baseline\.ts$/)
      expect(runCall.opts.scriptPath).not.toBe("baseline")
    }
  })

  it("baseline does not set exit code on success", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    backend.runResult = { exitCode: 0, output: "", outputFiles: [] }
    const prevExitCode = process.exitCode
    await runBaseline(backend)
    expect(process.exitCode).toBe(prevExitCode)
  })

  it("baseline sets exit code 1 on non-zero container exit", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    backend.runResult = { exitCode: 1, output: "", outputFiles: [] }
    const prevExitCode = process.exitCode
    await runBaseline(backend)
    expect(process.exitCode).toBe(1)
    process.exitCode = prevExitCode ?? 0
  })

  it("connect dispatches to backend.run() with extracted script path and imdsPort", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    await runConnect({ imdsPort: 9001, region: "us-west-2" }, backend)
    const runCall = backend.calls.find((c) => c.method === "run")
    expect(runCall).toBeDefined()
    if (runCall?.method === "run") {
      expect(runCall.opts.scriptPath).toMatch(/connect\.ts$/)
      expect(runCall.opts.scriptPath).not.toBe("connect")
      expect(runCall.opts.imdsPort).toBe(9001)
    }
  })

  it("baseline forwards onProgress to backend.run()", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    backend.progressLines = ["checking baseline"]
    const received: string[] = []
    await runBaseline(backend, (msg) => received.push(msg))
    expect(received).toEqual(["checking baseline"])
  })

  it("connect forwards onProgress to backend.run()", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    backend.progressLines = ["checking connect"]
    const received: string[] = []
    await runConnect({ imdsPort: 9001, region: "us-west-2" }, backend, (msg) => received.push(msg))
    expect(received).toEqual(["checking connect"])
  })

  it("ephemeral session directory is removed after baseline run", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    await runBaseline(backend)
    const runCall = backend.calls.find((c) => c.method === "run")
    expect(runCall).toBeDefined()
    if (runCall?.method === "run") {
      expect(existsSync(runCall.opts.sessionDir)).toBe(false)
    }
  })

  it("ephemeral session directory is removed even when backend.run throws", async () => {
    const backend = new DummyBackend()
    backend.imageExistsResult = true
    let captured: { sessionDir: string } | undefined
    backend.run = async (opts) => {
      captured = { sessionDir: opts.sessionDir }
      throw new Error("boom")
    }
    await expect(runBaseline(backend)).rejects.toThrow("boom")
    expect(captured).toBeDefined()
    if (captured) {
      expect(existsSync(captured.sessionDir)).toBe(false)
    }
  })
})

describe("CLI run", () => {
  async function stageScript(scriptName = "foo.ts"): Promise<{
    session: Session
    scriptPath: string
  }> {
    await establishWorkDir()
    const session = await Session.create()
    const scriptPath = await session.writeScript(scriptName, "console.log('ok')")
    process.chdir(isolatedCwd.currentDir())
    return { session, scriptPath }
  }

  it("dispatches to backend.run() with correct RunOptions", async () => {
    const backend = new DummyBackend()
    const { session, scriptPath } = await stageScript()

    await runRun(
      { script: "foo.ts", imdsPort: 9001, region: "us-west-2", session: session.name },
      backend,
    )

    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { imdsPort: 9001, session: session.name },
    })
    const runCall = backend.calls[0]
    if (runCall?.method === "run") {
      expect(runCall.opts.scriptPath).toBe(scriptPath)
    }
  })

  it("forwards onProgress to backend.run() without adding a prefix", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["compiling..."]
    const received: string[] = []
    const { session } = await stageScript()

    await runRun(
      { script: "foo.ts", imdsPort: 9001, region: "us-west-2", session: session.name },
      backend,
      (msg) => received.push(msg),
    )

    expect(received).toEqual(["compiling..."])
  })

  it("passes script args after --", async () => {
    const backend = new DummyBackend()
    const { session } = await stageScript()

    await runRun(
      {
        script: "foo.ts",
        imdsPort: 9001,
        region: "us-west-2",
        session: session.name,
        "--": ["arg1", "arg2"],
      },
      backend,
    )

    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptArgs: ["arg1", "arg2"] },
    })
  })

  it("keeps numeric-looking args after -- as strings", async () => {
    const backend = new DummyBackend()
    const { session } = await stageScript()

    await yargs([
      "run",
      "--session",
      session.name,
      "--script",
      "foo.ts",
      "--imds-port",
      "9001",
      "--region",
      "us-west-2",
      "--",
      "527100417633",
    ])
      .command(makeRunCommand(backend, () => {}))
      .demandCommand(1)
      .strict()
      .parseAsync()

    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptArgs: ["527100417633"] },
    })
  })

  it("requires --session", () => {
    const backend = new DummyBackend()

    expect(() =>
      yargs(["run", "--script", "foo.ts", "--imds-port", "9001"])
        .exitProcess(false)
        .command(makeRunCommand(backend, () => {}))
        .demandCommand(1)
        .strict()
        .parse(),
    ).toThrow(/session/)
  })

  it("requires --script", () => {
    const backend = new DummyBackend()

    expect(() =>
      yargs(["run", "--session", "my-session", "--imds-port", "9001"])
        .exitProcess(false)
        .command(makeRunCommand(backend, () => {}))
        .demandCommand(1)
        .strict()
        .parse(),
    ).toThrow(/script/)
  })

  it("reports full expected path when script is missing", async () => {
    const backend = new DummyBackend()
    const { session } = await stageScript()

    await expect(
      runRun(
        { script: "missing.ts", imdsPort: 9001, region: "us-west-2", session: session.name },
        backend,
      ),
    ).rejects.toThrow(/missing\.ts/)
  })

  it("rejects symlink scripts", async () => {
    const backend = new DummyBackend()
    await establishWorkDir()
    const session = await Session.create()
    mkdirSync(join(session.dir, "outside"), { recursive: true })
    const realPath = join(session.dir, "outside", "real.ts")
    writeFileSync(realPath, "console.log('outside')")
    symlinkSync(realPath, join(session.scriptsDir, "linked.ts"))
    process.chdir(isolatedCwd.currentDir())

    await expect(
      runRun(
        { script: "linked.ts", imdsPort: 9001, region: "us-west-2", session: session.name },
        backend,
      ),
    ).rejects.toThrow(/linked\.ts/)
  })

  it("sets process.exitCode when script exits non-zero", async () => {
    const backend = new DummyBackend()
    backend.runResult = { exitCode: 2, output: "", outputFiles: [] }
    const prevExitCode = process.exitCode
    const { session } = await stageScript()

    await runRun(
      { script: "foo.ts", imdsPort: 9001, region: "us-west-2", session: session.name },
      backend,
    )

    expect(process.exitCode).toBe(2)
    process.exitCode = prevExitCode ?? 0
  })

  it("output directory message does not carry [err] prefix", async () => {
    const backend = new DummyBackend()
    const stderrLines: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrLines.push(chunk.toString())
      return true
    }

    const { session } = await stageScript()
    try {
      await runRun(
        { script: "foo.ts", imdsPort: 9001, region: "us-west-2", session: session.name },
        backend,
      )
    } finally {
      process.stderr.write = originalWrite
    }

    const combined = stderrLines.join("")
    expect(combined).toContain("output directory")
    expect(combined).not.toContain("[err]")
  })
})

describe("CLI mcp", () => {
  it("starts MCP server and returns 0", async () => {
    const backend = new DummyBackend()
    const exitCode = await runMcp(backend, console.error, noopLogger())
    expect(exitCode).toBe(0)
  })
})
