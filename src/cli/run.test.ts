import { describe, expect, test } from "bun:test"
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import yargs from "yargs"
import { DummyBackend } from "../dummy-backend"
import { createSession } from "../session"
import { useTestCwdIsolation } from "../test-tooling/isolated-cwd"
import { DEFAULT_REGION } from "../types"
import { establishWorkDir } from "../workdir"
import { makeRunCommand, runRun } from "./run"

const isolatedCwd = useTestCwdIsolation()

describe("runRun", () => {
  test("resolves script from <session>/scripts", async () => {
    const backend = new DummyBackend()
    await establishWorkDir()
    const session = await createSession("my-session")
    const scriptPath = join(session.dir, "scripts", "hello.ts")
    writeFileSync(scriptPath, "console.log('ok')")

    process.chdir(isolatedCwd.currentDir())
    await runRun(
      {
        session: "my-session",
        script: "hello.ts",
        imdsPort: 9001,
        region: DEFAULT_REGION,
      },
      backend,
    )

    const runCall = backend.calls.find((c) => c.method === "run")
    expect(runCall).toBeDefined()
    if (!runCall || runCall.method !== "run") {
      return
    }
    expect(runCall.opts.scriptPath).toBe(scriptPath)
  })

  test("returns full expected path when script is missing", async () => {
    const backend = new DummyBackend()

    await expect(
      runRun(
        {
          session: "my-session",
          script: "missing.ts",
          imdsPort: 9001,
          region: DEFAULT_REGION,
        },
        backend,
      ),
    ).rejects.toThrow(/missing.ts/)
  })

  test("rejects symlink scripts", async () => {
    const backend = new DummyBackend()
    await establishWorkDir()
    const session = await createSession("my-session")
    const scriptsDir = join(session.dir, "scripts")
    mkdirSync(join(session.dir, "outside"), { recursive: true })
    const outsidePath = join(session.dir, "outside", "real.ts")
    writeFileSync(outsidePath, "console.log('outside')")
    symlinkSync(outsidePath, join(scriptsDir, "linked.ts"))

    process.chdir(isolatedCwd.currentDir())
    await expect(
      runRun(
        {
          session: "my-session",
          script: "linked.ts",
          imdsPort: 9001,
          region: DEFAULT_REGION,
        },
        backend,
      ),
    ).rejects.toThrow(/linked.ts/)
  })
})

describe("makeRunCommand", () => {
  test("requires --session", () => {
    const backend = new DummyBackend()

    expect(() =>
      yargs(["run", "--script", "a.ts", "--imds-port", "9001"])
        .exitProcess(false)
        .command(makeRunCommand(backend, () => {}))
        .strict()
        .parse(),
    ).toThrow(/session/)
  })

  test("requires --script", () => {
    const backend = new DummyBackend()

    expect(() =>
      yargs(["run", "--session", "my-session", "--imds-port", "9001"])
        .exitProcess(false)
        .command(makeRunCommand(backend, () => {}))
        .strict()
        .parse(),
    ).toThrow(/script/)
  })

  test("propagates handler failures from runRun", async () => {
    const backend = new DummyBackend()

    await expect(
      yargs(["run", "--session", "my-session", "--script", "missing.ts", "--imds-port", "9001"])
        .exitProcess(false)
        .fail((msg, err) => {
          throw err ?? new Error(msg)
        })
        .command(makeRunCommand(backend, () => {}))
        .strict()
        .parseAsync(),
    ).rejects.toThrow(/script not found/)
  })
})
