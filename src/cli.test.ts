import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { runConfig } from "./cli/config"
import { runImage } from "./cli/image"
import { runBaseline, runConnect } from "./cli/check"
import { runRun } from "./cli/run"
import { runMcp } from "./cli/mcp"
import { DummyBackend } from "./dummy-backend"

const tmpDir = join(import.meta.dir, "../.tmp-test-cli")

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true })
  process.env.XDG_CONFIG_HOME = tmpDir
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(join(import.meta.dir, ".."))
  rmSync(tmpDir, { recursive: true, force: true })
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
    expect(backend.calls).toEqual([{ method: "imageDelete" }])
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
  it("baseline dispatches to backend.run()", async () => {
    const backend = new DummyBackend()
    await runBaseline(backend)
    expect(backend.calls[0]).toMatchObject({ method: "run", opts: { scriptPath: "__baseline__" } })
  })

  it("baseline does not set exit code on success", async () => {
    const backend = new DummyBackend()
    backend.runResult = { exitCode: 0, output: "", outputFiles: [] }
    const prevExitCode = process.exitCode
    await runBaseline(backend)
    expect(process.exitCode).toBe(prevExitCode)
  })

  it("baseline sets exit code 1 on non-zero container exit", async () => {
    const backend = new DummyBackend()
    backend.runResult = { exitCode: 1, output: "", outputFiles: [] }
    const prevExitCode = process.exitCode
    await runBaseline(backend)
    expect(process.exitCode).toBe(1)
    process.exitCode = prevExitCode
  })

  it("connect dispatches to backend.run() with imdsPort", async () => {
    const backend = new DummyBackend()
    await runConnect({ imdsPort: 9001, region: "us-west-2" }, backend)
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptPath: "__connect__", imdsPort: 9001 },
    })
  })

  it("baseline forwards onProgress to backend.run()", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["checking baseline"]
    const received: string[] = []
    await runBaseline(backend, (msg) => received.push(msg))
    expect(received).toEqual(["checking baseline"])
  })

  it("connect forwards onProgress to backend.run()", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["checking connect"]
    const received: string[] = []
    await runConnect({ imdsPort: 9001, region: "us-west-2" }, backend, (msg) => received.push(msg))
    expect(received).toEqual(["checking connect"])
  })
})

describe("CLI run", () => {
  it("dispatches to backend.run() with correct RunOptions", async () => {
    const backend = new DummyBackend()
    await runRun({ script: "foo.ts", imdsPort: 9001, region: "us-west-2" }, backend)
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptPath: "foo.ts", imdsPort: 9001 },
    })
  })

  it("forwards onProgress to backend.run() without adding a prefix", async () => {
    const backend = new DummyBackend()
    backend.progressLines = ["compiling..."]
    const received: string[] = []
    await runRun({ script: "foo.ts", imdsPort: 9001, region: "us-west-2" }, backend, (msg) =>
      received.push(msg),
    )
    expect(received).toEqual(["compiling..."])
  })

  it("uses provided --session name", async () => {
    const backend = new DummyBackend()
    await runRun(
      { script: "foo.ts", imdsPort: 9001, region: "us-west-2", session: "my-session" },
      backend,
    )
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { session: "my-session" },
    })
  })

  it("auto-generates session when none provided", async () => {
    const backend = new DummyBackend()
    await runRun({ script: "foo.ts", imdsPort: 9001, region: "us-west-2" }, backend)
    const call = backend.calls[0]
    expect(call).toBeDefined()
    if (call && call.method === "run") {
      expect(call.opts.session).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
    }
  })

  it("uses --output-dir as session directory when provided", async () => {
    const backend = new DummyBackend()
    const customDir = join(tmpDir, "my-out")
    await runRun(
      { script: "foo.ts", imdsPort: 9001, region: "us-west-2", outputDir: customDir },
      backend,
    )
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { sessionDir: customDir },
    })
  })

  it("passes script args after --", async () => {
    const backend = new DummyBackend()
    await runRun(
      { script: "foo.ts", imdsPort: 9001, region: "us-west-2", "--": ["arg1", "arg2"] },
      backend,
    )
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptArgs: ["arg1", "arg2"] },
    })
  })

  it("sets process.exitCode when script exits non-zero", async () => {
    const backend = new DummyBackend()
    backend.runResult = { exitCode: 2, output: "", outputFiles: [] }
    const prevExitCode = process.exitCode
    await runRun({ script: "foo.ts", imdsPort: 9001, region: "us-west-2" }, backend)
    expect(process.exitCode).toBe(2)
    process.exitCode = prevExitCode
  })

  it("output directory message does not carry [err] prefix", async () => {
    const backend = new DummyBackend()
    const stderrLines: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrLines.push(chunk.toString())
      return true
    }
    try {
      await runRun({ script: "foo.ts", imdsPort: 9001, region: "us-west-2" }, backend)
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
    const exitCode = await runMcp(backend)
    expect(exitCode).toBe(0)
  })
})
