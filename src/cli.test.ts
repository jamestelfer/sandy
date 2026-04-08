import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { runConfig } from "./cli/config"
import { runImage } from "./cli/image"
import { runCheck } from "./cli/check"
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
    const exitCode = await runConfig([], (line) => output.push(line))
    expect(exitCode).toBe(0)
    expect(output.join("\n")).toContain("shuru")
  })

  it("--shuru flag writes shuru config", async () => {
    const output: string[] = []
    const exitCode = await runConfig(["--shuru"], (line) => output.push(line))
    expect(exitCode).toBe(0)
    expect(output.join("\n")).toContain("shuru")
    const verify: string[] = []
    await runConfig([], (line) => verify.push(line))
    expect(verify.join("\n")).toContain("shuru")
  })

  it("--docker flag writes docker config", async () => {
    const output: string[] = []
    const exitCode = await runConfig(["--docker"], (line) => output.push(line))
    expect(exitCode).toBe(0)
    expect(output.join("\n")).toContain("docker")
    const verify: string[] = []
    await runConfig([], (line) => verify.push(line))
    expect(verify.join("\n")).toContain("docker")
  })
})

describe("CLI image", () => {
  it("create dispatches to backend.imageCreate()", async () => {
    const backend = new DummyBackend()
    const exitCode = await runImage(["create"], backend)
    expect(exitCode).toBe(0)
    expect(backend.calls).toEqual([{ method: "imageCreate" }])
  })

  it("delete dispatches to backend.imageDelete()", async () => {
    const backend = new DummyBackend()
    const exitCode = await runImage(["delete"], backend)
    expect(exitCode).toBe(0)
    expect(backend.calls).toEqual([{ method: "imageDelete" }])
  })

  it("unknown subcommand exits non-zero", async () => {
    const backend = new DummyBackend()
    const errors: string[] = []
    const exitCode = await runImage(
      ["unknown"],
      backend,
      () => {},
      (e) => errors.push(e),
    )
    expect(exitCode).toBe(1)
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe("CLI check", () => {
  it("baseline dispatches to backend.run()", async () => {
    const backend = new DummyBackend()
    const exitCode = await runCheck(["baseline"], backend)
    expect(exitCode).toBe(0)
    expect(backend.calls[0]).toMatchObject({ method: "run", opts: { scriptPath: "__baseline__" } })
  })

  it("connect dispatches to backend.run() with imdsPort", async () => {
    const backend = new DummyBackend()
    const exitCode = await runCheck(["connect", "--imds-port", "9001"], backend)
    expect(exitCode).toBe(0)
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptPath: "__connect__", imdsPort: 9001 },
    })
  })

  it("connect without --imds-port exits non-zero", async () => {
    const backend = new DummyBackend()
    const errors: string[] = []
    const exitCode = await runCheck(
      ["connect"],
      backend,
      () => {},
      (e) => errors.push(e),
    )
    expect(exitCode).toBe(1)
    expect(errors.some((e) => e.includes("--imds-port"))).toBe(true)
  })
})

describe("CLI run", () => {
  it("dispatches to backend.run() with correct RunOptions", async () => {
    const backend = new DummyBackend()
    const exitCode = await runRun(["--script", "foo.ts", "--imds-port", "9001"], backend)
    expect(exitCode).toBe(0)
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptPath: "foo.ts", imdsPort: 9001 },
    })
  })

  it("uses provided --session name", async () => {
    const backend = new DummyBackend()
    await runRun(["--script", "foo.ts", "--imds-port", "9001", "--session", "my-session"], backend)
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { session: "my-session" },
    })
  })

  it("auto-generates session when none provided", async () => {
    const backend = new DummyBackend()
    await runRun(["--script", "foo.ts", "--imds-port", "9001"], backend)
    const call = backend.calls[0]
    expect(call).toBeDefined()
    if (call && call.method === "run") {
      expect(call.opts.session).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/)
    }
  })

  it("exits non-zero when --script is missing", async () => {
    const backend = new DummyBackend()
    const errors: string[] = []
    const exitCode = await runRun(
      ["--imds-port", "9001"],
      backend,
      () => {},
      (e) => errors.push(e),
    )
    expect(exitCode).toBe(1)
    expect(errors.some((e) => e.includes("--script"))).toBe(true)
  })

  it("exits non-zero when --imds-port is missing", async () => {
    const backend = new DummyBackend()
    const errors: string[] = []
    const exitCode = await runRun(
      ["--script", "foo.ts"],
      backend,
      () => {},
      (e) => errors.push(e),
    )
    expect(exitCode).toBe(1)
    expect(errors.some((e) => e.includes("--imds-port"))).toBe(true)
  })

  it("passes script args after --", async () => {
    const backend = new DummyBackend()
    await runRun(["--script", "foo.ts", "--imds-port", "9001", "--", "arg1", "arg2"], backend)
    expect(backend.calls[0]).toMatchObject({
      method: "run",
      opts: { scriptArgs: ["arg1", "arg2"] },
    })
  })
})

describe("CLI mcp", () => {
  it("exits non-zero with not-implemented message", async () => {
    const errors: string[] = []
    const exitCode = await runMcp((e) => errors.push(e))
    expect(exitCode).toBe(1)
    expect(errors.some((e) => e.includes("not yet implemented"))).toBe(true)
  })
})
