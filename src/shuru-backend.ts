import * as path from "node:path"
import * as fs from "node:fs/promises"
import type { Backend } from "./backend"
import type { RunOptions, RunResult } from "./types"

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

export type SandboxFactory = (opts: object) => Promise<unknown>

const CHECKPOINT_NAME = "sandy"
const NETSKOPE_CERT_PATH =
  "/Library/Application Support/Netskope/STAgent/data/nscacert.pem"
const VM_BOOTSTRAP = "/tmp/bootstrap"
const STAGING_DIR = ".sandy/bootstrap"

export class ShuruBackend implements Backend {
  constructor(
    private executor: ShellExecutor = async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    private sandboxFactory: SandboxFactory = async () => ({}),
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

  async run(_opts: RunOptions, _onProgress: (message: string) => void): Promise<RunResult> {
    throw new Error("not implemented")
  }
}
