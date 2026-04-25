import * as path from "node:path"
import type { StartOptions } from "@superhq/shuru"
import { Sandbox } from "@superhq/shuru"
import type { RunOptions, RunResult } from "../core/types"
import { VM_BOOTSTRAP, VM_OUTPUT_DIR, VM_SCRIPTS_DIR } from "../core/types"
import { buildRunEnv } from "../execution/run-env"
import { OutputTracker } from "../execution/scan-output"
import type { OutputHandler } from "../output/handler"
import { stageBootstrapFiles } from "../resources/bootstrap-staging"
import { makeTmpDir } from "../resources/tmpdir"
import type { Backend } from "./backend"

export type ShellExecutor = (
  cmd: string[],
  opts?: { cwd?: string; handler?: OutputHandler },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>

export interface SandboxLike {
  spawn(cmd: string[], opts?: { env?: Record<string, string> }): Promise<SpawnHandleLike>
  stop(): Promise<void>
}

export interface SpawnHandleLike {
  on(event: "stdout" | "stderr", handler: (data: Buffer) => void): this
  exited: Promise<number>
}

export type SandboxFactory = (opts: StartOptions) => Promise<SandboxLike>

const defaultSandboxFactory: SandboxFactory = async (opts) => Sandbox.start(opts)

const CHECKPOINT_NAME = "sandy"

async function readStream(
  stream: ReadableStream<Uint8Array>,
  onLine?: (line: string) => void,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  const lines: string[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buf += decoder.decode(value, { stream: true })
      const nl = buf.lastIndexOf("\n")
      if (nl !== -1) {
        for (const raw of buf.slice(0, nl).split("\n")) {
          const line = raw.trimEnd()
          if (line) {
            lines.push(line)
            onLine?.(line)
          }
        }
        buf = buf.slice(nl + 1)
      }
    }
    buf += decoder.decode()
    const line = buf.trimEnd()
    if (line) {
      lines.push(line)
      onLine?.(line)
    }
  } finally {
    reader.releaseLock()
  }
  return lines.join("\n")
}

const defaultExecutor: ShellExecutor = async (cmd, opts) => {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", cwd: opts?.cwd })
  const h = opts?.handler
  const [stdout, stderr, exitCode] = await Promise.all([
    readStream(proc.stdout, h ? (l) => h.stdoutLine(l) : undefined),
    readStream(proc.stderr, h ? (l) => h.stderrLine(l) : undefined),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} exited with code ${exitCode}: ${stderr}`)
  }
  return { stdout, stderr, exitCode }
}

export class ShuruBackend implements Backend {
  constructor(
    private executor: ShellExecutor = defaultExecutor,
    private sandboxFactory: SandboxFactory = defaultSandboxFactory,
  ) {}

  async imageExists(_handler: OutputHandler): Promise<boolean> {
    // imageExists is a silent probe — no subprocess output, callback intentionally unused
    const { stdout } = await this.executor(["shuru", "checkpoint", "list"])
    return stdout
      .split("\n")
      .some((line) => line === CHECKPOINT_NAME || line.startsWith(`${CHECKPOINT_NAME} `))
  }

  async imageDelete(handler: OutputHandler, _force?: boolean): Promise<void> {
    await this.executor(["shuru", "checkpoint", "delete", CHECKPOINT_NAME], { handler })
  }

  async imageCreate(handler: OutputHandler): Promise<void> {
    await using staging = await makeTmpDir("sandy-shuru-bootstrap-", process.cwd())
    await stageBootstrapFiles(staging.path)

    await this.executor(
      [
        "shuru",
        "checkpoint",
        "create",
        CHECKPOINT_NAME,
        "--allow-net",
        "--mount",
        `${staging.path}:${VM_BOOTSTRAP}`,
        "--",
        "sh",
        `${VM_BOOTSTRAP}/init.sh`,
        "all",
      ],
      { handler },
    )
  }

  async run(opts: RunOptions, handler: OutputHandler): Promise<RunResult> {
    const sessionDir = path.resolve(opts.sessionDir)
    const scriptDirPath = path.join(sessionDir, "scripts")
    const outputDirPath = path.join(sessionDir, "output")
    const scriptName = path.basename(opts.scriptPath, ".ts")
    const compiledPath = `/workspace/dist/scripts/${scriptName}.js`
    const imdsEndpoint = `http://10.0.0.1:${opts.imdsPort}`
    const spawnEnv = buildRunEnv(opts, imdsEndpoint)

    const startOpts: StartOptions = {
      from: CHECKPOINT_NAME,
      allowNet: true,
      allowHostWrites: true,
      exposeHost: [String(opts.imdsPort)],
      mounts: {
        [scriptDirPath]: VM_SCRIPTS_DIR,
        [outputDirPath]: `${VM_OUTPUT_DIR}:rw`,
      },
      network: {
        allow: ["*.amazonaws.com", "*.aws.amazon.com"],
      },
    }

    const sb = await this.sandboxFactory(startOpts)

    const spawnCmd = ["sh", "-l", "/workspace/entrypoint", compiledPath, ...(opts.scriptArgs ?? [])]

    const tracker = await OutputTracker.create(outputDirPath)

    try {
      const proc = await sb.spawn(spawnCmd, { env: spawnEnv })

      proc.on("stdout", (data) => handler.feedStdout(data))
      proc.on("stderr", (data) => handler.feedStderr(data))

      const exitCode = await proc.exited
      handler.flush()

      const outputFiles = await tracker.changed()

      return { exitCode, output: handler.output, outputFiles }
    } finally {
      await sb.stop()
    }
  }
}
