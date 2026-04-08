import * as path from "node:path"
import * as fs from "node:fs/promises"
import type { StartOptions } from "@superhq/shuru"
import { Sandbox } from "@superhq/shuru"
import type { Backend } from "./backend"
import type { RunOptions, RunResult } from "./types"
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
import { parseProgressLine } from "./progress"

// Bootstrap file embeds — bundled into binary by Bun
import initShPath from "./bootstrap/init.sh" with { type: "file" }
import nodeCertsShPath from "./bootstrap/node_certs.sh" with { type: "file" }
import bootstrapPackageJsonPath from "./bootstrap/package.json" with { type: "file" }
import bootstrapTsconfigJsonPath from "./bootstrap/tsconfig.json" with { type: "file" }
import entrypointPath from "./bootstrap/entrypoint" with { type: "file" }

export type ShellExecutor = (
  cmd: string[],
  opts?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>

export interface SandboxLike {
  spawn(
    cmd: string[],
    opts?: { env?: Record<string, string> },
  ): Promise<SpawnHandleLike>
  stop(): Promise<void>
}

export interface SpawnHandleLike {
  on(event: "stdout" | "stderr", handler: (data: Buffer) => void): this
  exited: Promise<number>
}

export type SandboxFactory = (opts: StartOptions) => Promise<SandboxLike>

const defaultSandboxFactory: SandboxFactory = async (opts) => Sandbox.start(opts)

const CHECKPOINT_NAME = "sandy"
const NETSKOPE_CERT_PATH =
  "/Library/Application Support/Netskope/STAgent/data/nscacert.pem"
const VM_BOOTSTRAP = "/tmp/bootstrap"
const STAGING_DIR = ".sandy/bootstrap"

const defaultExecutor: ShellExecutor = async (cmd, opts) => {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", cwd: opts?.cwd })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
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
    await this.executor(["shuru", "checkpoint", "delete", CHECKPOINT_NAME])
  }

  async imageCreate(): Promise<void> {
    await fs.mkdir(STAGING_DIR, { recursive: true })
    await fs.mkdir(`${STAGING_DIR}/certs`, { recursive: true })

    await Promise.all([
      fs.copyFile(initShPath, `${STAGING_DIR}/init.sh`),
      fs.copyFile(nodeCertsShPath, `${STAGING_DIR}/node_certs.sh`),
      fs.copyFile(bootstrapPackageJsonPath, `${STAGING_DIR}/package.json`),
      fs.copyFile(bootstrapTsconfigJsonPath, `${STAGING_DIR}/tsconfig.json`),
      fs.copyFile(entrypointPath, `${STAGING_DIR}/entrypoint`),
    ])

    // Copy Netskope cert if present
    try {
      await fs.copyFile(NETSKOPE_CERT_PATH, `${STAGING_DIR}/certs/nscacert.pem`)
      process.stderr.write("sandy: Netskope certificate staged for installation\n")
    } catch {
      process.stderr.write("sandy: Netskope certificate not found, skipping\n")
    }

    const stagingAbsPath = path.resolve(STAGING_DIR)

    await this.executor([
      "shuru",
      "checkpoint",
      "create",
      CHECKPOINT_NAME,
      "--allow-net",
      "--mount",
      `${stagingAbsPath}:${VM_BOOTSTRAP}`,
      "--",
      "sh",
      `${VM_BOOTSTRAP}/init.sh`,
    ])
  }

  async run(opts: RunOptions, onProgress: (message: string) => void): Promise<RunResult> {
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

    const spawnCmd = [
      "sh",
      "-l",
      "/workspace/entrypoint",
      compiledPath,
      ...(opts.scriptArgs ?? []),
    ]

    try {
      const proc = await sb.spawn(spawnCmd, { env: spawnEnv })

      let stdoutBuf = ""
      let stderrBuf = ""

      proc.on("stdout", (data) => {
        const text = data.toString()
        stdoutBuf += text
        for (const raw of text.split("\n")) {
          const line = raw.trimEnd()
          if (!line) {
            continue
          }
          const parsed = parseProgressLine(line)
          if (parsed.isProgress) {
            onProgress(parsed.message)
          }
        }
      })

      proc.on("stderr", (data) => {
        stderrBuf += data.toString()
      })

      const exitCode = await proc.exited

      return { exitCode, stdout: stdoutBuf, stderr: stderrBuf, outputFiles: [] }
    } finally {
      await sb.stop()
    }
  }
}
