import * as path from "node:path"
import * as fs from "node:fs/promises"
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

export interface ImageLike {
  inspect(): Promise<unknown>
  remove(): Promise<unknown>
}

export interface ContainerLike {
  id: string
  start(): Promise<void>
  logs(opts: { follow: boolean; stdout: boolean; stderr: boolean }): Promise<NodeJS.ReadableStream>
  wait(): Promise<{ StatusCode: number }>
  remove(): Promise<void>
}

export interface DockerClientLike {
  getImage(name: string): ImageLike
  buildImage(context: NodeJS.ReadableStream, opts: { t: string }): Promise<NodeJS.ReadableStream>
  createContainer(opts: object): Promise<ContainerLike>
  modem: {
    demuxStream(
      stream: NodeJS.ReadableStream,
      stdout: NodeJS.WritableStream,
      stderr: NodeJS.WritableStream,
    ): void
  }
}

export type BuildContextFactory = () => Promise<NodeJS.ReadableStream>

const IMAGE_NAME = "sandy:latest"
const STAGING_DIR = ".sandy/bootstrap"
const VM_BOOTSTRAP = "/tmp/bootstrap"
const NETSKOPE_CERT_PATH = "/Library/Application Support/Netskope/STAgent/data/nscacert.pem"

export function generateDockerfile(): string {
  return `FROM ubuntu:24.04
COPY bootstrap/ ${VM_BOOTSTRAP}/
RUN chmod +x ${VM_BOOTSTRAP}/init.sh ${VM_BOOTSTRAP}/entrypoint && \\
    sh ${VM_BOOTSTRAP}/init.sh
ENTRYPOINT ["pnpm", "run", "-s", "entrypoint"]
`
}

async function defaultBuildContextFactory(): Promise<NodeJS.ReadableStream> {
  await fs.mkdir(STAGING_DIR, { recursive: true })
  await fs.mkdir(`${STAGING_DIR}/bootstrap`, { recursive: true })
  await fs.mkdir(`${STAGING_DIR}/bootstrap/certs`, { recursive: true })

  await Promise.all([
    fs.copyFile(initShPath, `${STAGING_DIR}/bootstrap/init.sh`),
    fs.copyFile(nodeCertsShPath, `${STAGING_DIR}/bootstrap/node_certs.sh`),
    fs.copyFile(bootstrapPackageJsonPath, `${STAGING_DIR}/bootstrap/package.json`),
    fs.copyFile(bootstrapTsconfigJsonPath, `${STAGING_DIR}/bootstrap/tsconfig.json`),
    fs.copyFile(entrypointPath, `${STAGING_DIR}/bootstrap/entrypoint`),
    fs.writeFile(`${STAGING_DIR}/Dockerfile`, generateDockerfile()),
  ])

  // Copy Netskope cert if present
  try {
    await fs.copyFile(NETSKOPE_CERT_PATH, `${STAGING_DIR}/bootstrap/certs/nscacert.pem`)
    process.stderr.write("sandy: Netskope certificate staged for installation\n")
  } catch {
    process.stderr.write("sandy: Netskope certificate not found, skipping\n")
  }

  const absDir = path.resolve(STAGING_DIR)
  const proc = Bun.spawn(["tar", "-c", "."], { cwd: absDir, stdout: "pipe", stderr: "pipe" })
  return proc.stdout as unknown as NodeJS.ReadableStream
}

export class DockerBackend implements Backend {
  constructor(
    private docker: DockerClientLike,
    private buildContext: BuildContextFactory = defaultBuildContextFactory,
  ) {}

  async imageExists(): Promise<boolean> {
    try {
      await this.docker.getImage(IMAGE_NAME).inspect()
      return true
    } catch {
      return false
    }
  }

  async imageDelete(): Promise<void> {
    await this.docker.getImage(IMAGE_NAME).remove()
  }

  async imageCreate(): Promise<void> {
    const context = await this.buildContext()
    const stream = await this.docker.buildImage(context, { t: IMAGE_NAME })
    // Drain the build output stream to completion
    await new Promise<void>((resolve, reject) => {
      stream.on("data", () => {})
      stream.on("end", resolve)
      stream.on("error", reject)
    })
  }

  async run(_opts: RunOptions, _onProgress: (message: string) => void): Promise<RunResult> {
    throw new Error("not implemented")
  }
}
