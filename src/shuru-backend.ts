import * as path from "node:path"
import * as fs from "node:fs/promises"
import { makeTmpDir } from "./tmpdir"
import type { StartOptions } from "@superhq/shuru"
import { Sandbox } from "@superhq/shuru"
import type { Backend } from "./backend"
import type { ProgressCallback, RunOptions, RunResult } from "./types"
import {
  DEFAULT_REGION,
  ENV_ENDPOINT,
  ENV_ENDPOINT_MODE,
  ENV_ENDPOINT_MODE_VALUE,
  ENV_REGION,
  ENV_SANDY_OUTPUT,
  ENV_V1_DISABLED,
  ENV_V1_DISABLED_VALUE,
  VM_OUTPUT_DIR,
  VM_SCRIPTS_DIR,
} from "./types"
import { OutputHandler } from "./output-handler"

// Bootstrap file embeds — bundled into binary by Bun
import initShPath from "./bootstrap/init.sh" with { type: "file" }
import nodeCertsShPath from "./bootstrap/node_certs.sh" with { type: "file" }
import bootstrapPackageJsonPath from "./bootstrap/package.json" with { type: "file" }
import bootstrapTsconfigJsonPath from "./bootstrap/tsconfig.json" with { type: "file" }
import entrypointPath from "./bootstrap/entrypoint" with { type: "file" }

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
const NETSKOPE_CERT_PATH = "/Library/Application Support/Netskope/STAgent/data/nscacert.pem"
const VM_BOOTSTRAP = "/tmp/bootstrap"

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
  return { stdout, stderr, exitCode }
}

export class ShuruBackend implements Backend {
  constructor(
    private executor: ShellExecutor = defaultExecutor,
    private sandboxFactory: SandboxFactory = defaultSandboxFactory,
  ) {}

  async imageExists(): Promise<boolean> {
    const { stdout } = await this.executor(["shuru", "checkpoint", "list"])
    return stdout
      .split("\n")
      .some((line) => line === CHECKPOINT_NAME || line.startsWith(`${CHECKPOINT_NAME} `))
  }

  async imageDelete(): Promise<void> {
    const handler = new OutputHandler(() => {})
    await this.executor(["shuru", "checkpoint", "delete", CHECKPOINT_NAME], { handler })
  }

  async imageCreate(): Promise<void> {
    await using staging = await makeTmpDir("sandy-shuru-bootstrap-")
    await fs.mkdir(`${staging.path}/certs`, { recursive: true })

    // Use Bun.file().arrayBuffer() instead of fs.copyFile() so this works when
    // the binary is compiled — embedded bunfs paths are not accessible to the OS.
    async function copyEmbedded(src: string, dest: string): Promise<void> {
      const buf = await Bun.file(src).arrayBuffer()
      await fs.writeFile(dest, new Uint8Array(buf))
    }

    await Promise.all([
      copyEmbedded(initShPath, `${staging.path}/init.sh`),
      copyEmbedded(nodeCertsShPath, `${staging.path}/node_certs.sh`),
      copyEmbedded(bootstrapPackageJsonPath, `${staging.path}/package.json`),
      copyEmbedded(bootstrapTsconfigJsonPath, `${staging.path}/tsconfig.json`),
      copyEmbedded(entrypointPath, `${staging.path}/entrypoint`),
    ])

    // Copy Netskope cert if present
    try {
      await fs.copyFile(NETSKOPE_CERT_PATH, `${staging.path}/certs/nscacert.pem`)
      process.stderr.write("sandy: Netskope certificate staged for installation\n")
    } catch {
      process.stderr.write("sandy: Netskope certificate not found, skipping\n")
    }

    const handler = new OutputHandler(() => {})
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
      ],
      { handler },
    )
  }

  async run(opts: RunOptions, onProgress: ProgressCallback): Promise<RunResult> {
    const scriptDir = path.dirname(path.resolve(opts.scriptPath))
    const scriptName = path.basename(opts.scriptPath, ".ts")
    const compiledPath = `/workspace/dist/scripts/${scriptName}.js`
    const imdsEndpoint = `http://10.0.0.1:${opts.imdsPort}`

    const startOpts: StartOptions = {
      from: CHECKPOINT_NAME,
      allowNet: true,
      allowHostWrites: true,
      exposeHost: [String(opts.imdsPort)],
      mounts: {
        [scriptDir]: VM_SCRIPTS_DIR,
        [opts.sessionDir]: `${VM_OUTPUT_DIR}:rw`,
      },
      network: {
        allow: ["*.amazonaws.com", "*.aws.amazon.com"],
      },
    }

    const sb = await this.sandboxFactory(startOpts)

    const spawnEnv: Record<string, string> = {
      [ENV_ENDPOINT]: imdsEndpoint,
      [ENV_ENDPOINT_MODE]: ENV_ENDPOINT_MODE_VALUE,
      [ENV_V1_DISABLED]: ENV_V1_DISABLED_VALUE,
      [ENV_REGION]: opts.region ?? DEFAULT_REGION,
      [ENV_SANDY_OUTPUT]: VM_OUTPUT_DIR,
    }

    const spawnCmd = ["sh", "-l", "/workspace/entrypoint", compiledPath, ...(opts.scriptArgs ?? [])]

    const handler = new OutputHandler(onProgress)

    try {
      const proc = await sb.spawn(spawnCmd, { env: spawnEnv })

      proc.on("stdout", (data) => {
        for (const raw of data.toString().split("\n")) {
          const line = raw.trimEnd()
          if (line) {
            handler.stdoutLine(line)
          }
        }
      })

      proc.on("stderr", (data) => {
        for (const raw of data.toString().split("\n")) {
          const line = raw.trimEnd()
          if (line) {
            handler.stderrLine(line)
          }
        }
      })

      const exitCode = await proc.exited

      return { exitCode, output: handler.output, outputFiles: [] }
    } finally {
      await sb.stop()
    }
  }
}
