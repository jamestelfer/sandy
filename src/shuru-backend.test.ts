import { describe, expect, test } from "bun:test"
import type { StartOptions } from "@superhq/shuru"
import { ShuruBackend } from "./shuru-backend"
import type { ShellExecutor, SandboxFactory } from "./shuru-backend"
import type { RunOptions } from "./types"

function makeSandboxFactory(config: { exitCode?: number; stdoutLines?: string[] } = {}): {
  factory: SandboxFactory
  startOptsCalls: StartOptions[]
  spawnCalls: Array<{ cmd: string[]; env?: Record<string, string> }>
} {
  const startOptsCalls: StartOptions[] = []
  const spawnCalls: Array<{ cmd: string[]; env?: Record<string, string> }> = []

  const factory: SandboxFactory = async (opts: StartOptions) => {
    startOptsCalls.push(opts)
    return {
      spawn: async (cmd: string[], spawnOpts?: { env?: Record<string, string> }) => {
        spawnCalls.push({ cmd, env: spawnOpts?.env })
        const listeners: { stdout: ((d: Buffer) => void)[]; stderr: ((d: Buffer) => void)[] } = {
          stdout: [],
          stderr: [],
        }
        const handle = {
          on(evt: "stdout" | "stderr", h: (d: Buffer) => void) {
            listeners[evt].push(h)
            return handle
          },
          // setTimeout(0) defers emission past listener registration
          exited: new Promise<number>((resolve) => {
            setTimeout(() => {
              for (const line of config.stdoutLines ?? []) {
                for (const h of listeners.stdout) {
                  h(Buffer.from(`${line}\n`))
                }
              }
              resolve(config.exitCode ?? 0)
            }, 0)
          }),
        }
        return handle
      },
      stop: async () => {},
    }
  }

  return { factory, startOptsCalls, spawnCalls }
}

const baseRunOpts: RunOptions = {
  scriptPath: "/home/user/scripts/hello.ts",
  imdsPort: 9001,
  session: "test-session",
  sessionDir: "/home/user/.sandy/test-session",
  scriptArgs: [],
}

function makeExecutor(
  responses: Record<string, { stdout: string; stderr: string; exitCode: number }> = {},
): { executor: ShellExecutor; calls: string[][] } {
  const calls: string[][] = []
  const executor: ShellExecutor = async (cmd) => {
    calls.push(cmd)
    return responses[cmd.join(" ")] ?? { stdout: "", stderr: "", exitCode: 0 }
  }
  return { executor, calls }
}

describe("ShuruBackend.run", () => {
  test("starts sandbox from the sandy checkpoint", async () => {
    const { factory, startOptsCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(baseRunOpts, () => {})
    expect(startOptsCalls[0]?.from).toBe("sandy")
  })

  test("mounts script dir read-only and session dir read-write", async () => {
    const { factory, startOptsCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(baseRunOpts, () => {})

    const mounts = startOptsCalls[0]?.mounts ?? {}
    // scriptPath /home/user/scripts/hello.ts → scriptDir /home/user/scripts
    expect(mounts["/home/user/scripts"]).toBe("/workspace/scripts")
    expect(mounts["/home/user/.sandy/test-session"]).toBe("/workspace/output:rw")
  })

  test("exposes IMDS port and restricts network to AWS domains", async () => {
    const { factory, startOptsCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run({ ...baseRunOpts, imdsPort: 9001 }, () => {})

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
    await backend.run({ ...baseRunOpts, imdsPort: 9001, region: "ap-southeast-2" }, () => {})

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
    await backend.run({ ...baseRunOpts, region: undefined }, () => {})
    expect(spawnCalls[0]?.env?.AWS_REGION).toBe("us-west-2")
  })

  test("spawns entrypoint with compiled script path derived from scriptPath basename", async () => {
    const { factory, spawnCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run(baseRunOpts, () => {})

    const cmd = spawnCalls[0]?.cmd ?? []
    expect(cmd.join(" ")).toContain("/workspace/entrypoint")
    expect(cmd.join(" ")).toContain("/workspace/dist/scripts/hello.js")
  })

  test("appends script args after the compiled path", async () => {
    const { factory, spawnCalls } = makeSandboxFactory()
    const backend = new ShuruBackend(undefined, factory)
    await backend.run({ ...baseRunOpts, scriptArgs: ["--foo", "bar"] }, () => {})

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
    await backend.run(baseRunOpts, (msg) => progress.push(msg))

    expect(progress).toContain("compiling...")
    expect(progress.join("\n")).not.toContain("normal output line")
  })

  test("collects all output into RunResult and captures exit code", async () => {
    const { factory } = makeSandboxFactory({ exitCode: 2, stdoutLines: ["line one", "line two"] })
    const backend = new ShuruBackend(undefined, factory)
    const result = await backend.run(baseRunOpts, () => {})

    expect(result.output).toContain("line one")
    expect(result.output).toContain("line two")
    expect(result.exitCode).toBe(2)
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
    await backend.run(baseRunOpts, () => {})
    expect(stopped).toBe(true)
  })
})

describe("ShuruBackend.imageCreate", () => {
  test("does not throw when Netskope cert is absent", async () => {
    const { executor } = makeExecutor()
    const backend = new ShuruBackend(executor)
    // Cert file doesn't exist — must not throw, just skip
    await expect(backend.imageCreate()).resolves.toBeUndefined()
  })

  test("calls shuru checkpoint create sandy with --allow-net and bootstrap mount", async () => {
    const { executor, calls } = makeExecutor()
    const backend = new ShuruBackend(executor)
    await backend.imageCreate()

    const cmd = calls[0]
    expect(cmd.slice(0, 4)).toEqual(["shuru", "checkpoint", "create", "sandy"])
    expect(cmd).toContain("--allow-net")

    const mountIdx = cmd.indexOf("--mount")
    expect(mountIdx).toBeGreaterThan(-1)
    expect(cmd[mountIdx + 1]).toMatch(/^.+:\/tmp\/bootstrap$/)

    const sepIdx = cmd.indexOf("--")
    expect(sepIdx).toBeGreaterThan(-1)
    expect(cmd.slice(sepIdx + 1).join(" ")).toContain("/tmp/bootstrap/init.sh")
  })
})

describe("ShuruBackend.imageDelete", () => {
  test("calls shuru checkpoint delete sandy", async () => {
    const { executor, calls } = makeExecutor()
    const backend = new ShuruBackend(executor)
    await backend.imageDelete()
    expect(calls[0]).toEqual(["shuru", "checkpoint", "delete", "sandy"])
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
    expect(await backend.imageExists()).toBe(false)
  })

  test("returns false when sandy is absent from the list", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": { stdout: "other-checkpoint 2024-01-02\n", stderr: "", exitCode: 0 },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists()).toBe(false)
  })

  test("returns false when checkpoint list is empty", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": { stdout: "", stderr: "", exitCode: 0 },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists()).toBe(false)
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
    expect(await backend.imageExists()).toBe(true)
    expect(calls[0]).toEqual(["shuru", "checkpoint", "list"])
  })
})
