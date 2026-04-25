import { describe, expect, test } from "bun:test"
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import yargs from "yargs"
import { DummyBackend } from "../dummy-backend"
import { Session } from "../session"
import { useTestCwdIsolation } from "../test-tooling/isolated-cwd"
import { DEFAULT_REGION } from "../types"
import { establishWorkDir } from "../workdir"
import { makeRunCommand, runRun } from "./run"

const isolatedCwd = useTestCwdIsolation()

async function stageScriptForRun(scriptName = "foo.ts"): Promise<{
  session: Session
  scriptPath: string
}> {
  await establishWorkDir()
  const session = await Session.create()
  const scriptPath = await session.writeScript(scriptName, "console.log('ok')")
  return { session, scriptPath }
}

describe("runRun", () => {
  test("resolves script from <session>/scripts", async () => {
    const backend = new DummyBackend()
    const { session, scriptPath } = await stageScriptForRun("hello.ts")

    process.chdir(isolatedCwd.currentDir())
    await runRun(
      {
        session: session.name,
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
    const { session } = await stageScriptForRun()
    process.chdir(isolatedCwd.currentDir())

    await expect(
      runRun(
        {
          session: session.name,
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
    const session = await Session.create()
    mkdirSync(join(session.dir, "outside"), { recursive: true })
    const outsidePath = join(session.dir, "outside", "real.ts")
    writeFileSync(outsidePath, "console.log('outside')")
    symlinkSync(outsidePath, join(session.scriptsDir, "linked.ts"))

    process.chdir(isolatedCwd.currentDir())
    await expect(
      runRun(
        {
          session: session.name,
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
    ).rejects.toThrow(/session not found/)
  })
})
