import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import type { RunOptions } from "./core"
import { OutputHandler } from "./output"
import { makeTmpDir } from "./resources"
import { type SandboxFactory, ShuruBackend } from "./sandbox"
import { makeExecutor, makeSandboxFactory } from "./test-support"

// Synthetic fixture paths — these never touch disk; the mock sandbox factory
// inspects them as strings to assert mount/spawn wiring.
const FIXTURE_SESSION_DIR = "/fixture/test-session"
const FIXTURE_SCRIPT_PATH = `${FIXTURE_SESSION_DIR}/scripts/hello.ts`

const baseRunOpts: RunOptions = {
  scriptPath: FIXTURE_SCRIPT_PATH,
  imdsPort: 9001,
  session: "test-session",
  sessionDir: FIXTURE_SESSION_DIR,
  scriptArgs: [],
}

describe("ShuruBackend.run", () => {
  test("starts sandbox from the sandy checkpoint", async () => {
    const { factory, startOptsCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(baseRunOpts, new OutputHandler(() => {}))
    expect(startOptsCalls[0]?.from).toBe("sandy")
  })

  test("mounts session scripts dir read-only and session output dir read-write", async () => {
    const { factory, startOptsCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(baseRunOpts, new OutputHandler(() => {}))

    const mounts = startOptsCalls[0]?.mounts ?? {}
    expect(mounts[`${FIXTURE_SESSION_DIR}/scripts`]).toBe("/workspace/scripts")
    expect(mounts[`${FIXTURE_SESSION_DIR}/output`]).toBe("/workspace/output:rw")
  })

  test("exposes IMDS port and restricts network to AWS domains", async () => {
    const { factory, startOptsCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run({ ...baseRunOpts, imdsPort: 9001 }, new OutputHandler(() => {}))

    const opts = startOptsCalls[0]
    expect(opts?.exposeHost).toContain("9001")
    expect(opts?.network?.allow).toContain("*.amazonaws.com")
    expect(opts?.network?.allow).toContain("*.aws.amazon.com")
    expect(opts?.allowNet).toBe(true)
    expect(opts?.allowHostWrites).toBe(true)
  })

  test("sets IMDS endpoint and all AWS env vars in spawn call", async () => {
    const { factory, spawnCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(
      { ...baseRunOpts, imdsPort: 9001, region: "ap-southeast-2" },
      new OutputHandler(() => {}),
    )

    const env = spawnCalls[0]?.env ?? {}
    expect(env.AWS_EC2_METADATA_SERVICE_ENDPOINT).toBe("http://10.0.0.1:9001")
    expect(env.AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE).toBe("IPv4")
    expect(env.AWS_EC2_METADATA_V1_DISABLED).toBe("true")
    expect(env.AWS_REGION).toBe("ap-southeast-2")
    expect(env.SANDY_OUTPUT).toBe("/workspace/output")
  })

  test("defaults to us-west-2 when region is not provided", async () => {
    const { factory, spawnCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run({ ...baseRunOpts, region: undefined }, new OutputHandler(() => {}))
    expect(spawnCalls[0]?.env?.AWS_REGION).toBe("us-west-2")
  })

  test("spawns entrypoint with compiled script path derived from scriptPath basename", async () => {
    const { factory, spawnCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(baseRunOpts, new OutputHandler(() => {}))

    const cmd = spawnCalls[0]?.cmd ?? []
    expect(cmd.join(" ")).toContain("/workspace/entrypoint")
    expect(cmd.join(" ")).toContain("/workspace/dist/scripts/hello.js")
  })

  test("appends script args after the compiled path", async () => {
    const { factory, spawnCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run({ ...baseRunOpts, scriptArgs: ["--foo", "bar"] }, new OutputHandler(() => {}))

    const cmd = spawnCalls[0]?.cmd ?? []
    expect(cmd).toContain("--foo")
    expect(cmd).toContain("bar")
  })

  test("forwards [-->-prefixed stdout lines as progress, not normal output", async () => {
    const { factory } = makeSandboxFactory({
      stdoutLines: ["[-->  compiling...", "normal output line"],
    })
    const backend = new ShuruBackend(undefined, factory)

    const progress: string[] = []
    await backend.run(baseRunOpts, new OutputHandler((msg) => progress.push(msg)))

    expect(progress).toContain("compiling...")
    expect(progress.join("\n")).not.toContain("normal output line")
  })

  test("collects all output into RunResult and captures exit code", async () => {
    const { factory } = makeSandboxFactory({ exitCode: 2, stdoutLines: ["line one", "line two"] })
    const backend = new ShuruBackend(undefined, factory)
    const result = await backend.run(baseRunOpts, new OutputHandler(() => {}))

    expect(result.output).toContain("line one")
    expect(result.output).toContain("line two")
    expect(result.exitCode).toBe(2)
  })

  test("assembles lines split across multiple stdout chunks", async () => {
    // Emit the line in two separate Buffer events (no \n in the first)
    const startOptsCalls: StartOptions[] = []
    const factory: SandboxFactory = async (opts) => {
      startOptsCalls.push(opts)
      return {
        spawn: async () => {
          const listeners: { stdout: ((d: Buffer) => void)[]; stderr: ((d: Buffer) => void)[] } = {
            stdout: [],
            stderr: [],
          }
          const handle = {
            on(evt: "stdout" | "stderr", h: (d: Buffer) => void) {
              listeners[evt].push(h)
              return handle
            },
            exited: new Promise<number>((resolve) => {
              setTimeout(() => {
                for (const h of listeners.stdout) {
                  h(Buffer.from("hel"))
                  h(Buffer.from("lo\n"))
                }
                resolve(0)
              }, 0)
            }),
          }
          return handle
        },
        stop: async () => {},
      }
    }
    const backend = new ShuruBackend(undefined, factory)
    const result = await backend.run(baseRunOpts, new OutputHandler(() => {}))
    expect(result.output).toContain("hello")
  })

  test("outputFiles includes files created during the run, not pre-existing ones", async () => {
    await using tmpDir = await makeTmpDir("shuru-run-test-")
    const outputDir = join(tmpDir.path, "output")
    await fs.mkdir(outputDir, { recursive: true })

    // pre-existing file written before the backend run starts
    await fs.writeFile(join(outputDir, "pre-existing.json"), "{}")

    // factory writes a new file into session output during "spawn" to simulate script output
    const factory: SandboxFactory = async () => ({
      spawn: async () => {
        await fs.writeFile(join(outputDir, "result.json"), "{}")
        const handle = {
          on: (_: "stdout" | "stderr", __: (d: Buffer) => void) => handle,
          exited: Promise.resolve(0),
        }
        return handle
      },
      stop: async () => {},
    })

    const backend = new ShuruBackend(undefined, factory)
    const result = await backend.run(
      { ...baseRunOpts, sessionDir: tmpDir.path },
      new OutputHandler(() => {}),
    )
    expect(result.outputFiles).toContain("result.json")
    expect(result.outputFiles).not.toContain("pre-existing.json")
  })

  test("returns empty outputFiles when sessionDir does not exist", async () => {
    const { factory } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    const result = await backend.run(
      { ...baseRunOpts, sessionDir: "/nonexistent/path/that/does/not/exist" },
      new OutputHandler(() => {}),
    )
    expect(result.outputFiles).toEqual([])
  })

  test("stops the sandbox after run completes", async () => {
    let stopped = false
    const factory: SandboxFactory = async () => ({
      spawn: async () => {
        const handle = {
          on: (_: "stdout" | "stderr", __: (d: Buffer) => void) => handle,
          exited: new Promise<number>((resolve) => setTimeout(() => resolve(0), 0)),
        }
        return handle
      },
      stop: async () => {
        stopped = true
      },
    })
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(baseRunOpts, new OutputHandler(() => {}))
    expect(stopped).toBe(true)
  })
})

describe("ShuruBackend.imageCreate", () => {
  test("does not throw when Netskope cert is absent", async () => {
    const { executor } = makeExecutor()
    const backend = new ShuruBackend(executor)
    // Cert file doesn't exist — must not throw, just skip
    await expect(backend.imageCreate(new OutputHandler(() => {}))).resolves.toBeUndefined()
  })

  test("calls shuru checkpoint create sandy with --allow-net and bootstrap mount", async () => {
    const { executor, calls } = makeExecutor()
    const backend = new ShuruBackend(executor)
    await backend.imageCreate(new OutputHandler(() => {}))

    const cmd = calls[0]
    expect(cmd.slice(0, 4)).toEqual(["shuru", "checkpoint", "create", "sandy"])
    expect(cmd).toContain("--allow-net")

    const mountIdx = cmd.indexOf("--mount")
    expect(mountIdx).toBeGreaterThan(-1)
    expect(cmd[mountIdx + 1]).toMatch(/^.+:\/tmp\/bootstrap$/)

    const sepIdx = cmd.indexOf("--")
    expect(sepIdx).toBeGreaterThan(-1)
    expect(cmd.slice(sepIdx + 1)).toEqual(["sh", "/tmp/bootstrap/init.sh", "all"])
  })

  test("forwards [-->-prefixed executor output as progress", async () => {
    const { executor } = makeExecutor({}, ["[-->  checkpoint step 1", "normal line"])
    const backend = new ShuruBackend(executor)
    const progress: string[] = []
    await backend.imageCreate(new OutputHandler((msg) => progress.push(msg)))
    expect(progress).toContain("checkpoint step 1")
    expect(progress.join("\n")).not.toContain("normal line")
  })
})

describe("ShuruBackend.imageDelete", () => {
  test("calls shuru checkpoint delete sandy", async () => {
    const { executor, calls } = makeExecutor()
    const backend = new ShuruBackend(executor)
    await backend.imageDelete(() => {})
    expect(calls[0]).toEqual(["shuru", "checkpoint", "delete", "sandy"])
  })

  test("forwards [-->-prefixed executor output as progress", async () => {
    const { executor } = makeExecutor({}, ["[-->  deleting checkpoint"])
    const backend = new ShuruBackend(executor)
    const progress: string[] = []
    await backend.imageDelete(new OutputHandler((msg) => progress.push(msg)))
    expect(progress).toContain("deleting checkpoint")
  })
})

describe("ShuruBackend.imageExists", () => {
  test("does not match a checkpoint that contains sandy only as a substring", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": {
        stdout: "not-sandy 2024-01-01\nsandy-extra 2024-01-02\n",
        stderr: "",
        exitCode: 0,
      },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists(() => {})).toBe(false)
  })

  test("returns false when sandy is absent from the list", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": { stdout: "other-checkpoint 2024-01-02\n", stderr: "", exitCode: 0 },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists(() => {})).toBe(false)
  })

  test("returns false when checkpoint list is empty", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": { stdout: "", stderr: "", exitCode: 0 },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists(() => {})).toBe(false)
  })

  test("calls shuru checkpoint list and returns true when sandy is present", async () => {
    const { executor, calls } = makeExecutor({
      "shuru checkpoint list": {
        stdout: "sandy 2024-01-01\nother 2024-01-02\n",
        stderr: "",
        exitCode: 0,
      },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists(() => {})).toBe(true)
    expect(calls[0]).toEqual(["shuru", "checkpoint", "list"])
  })
})
