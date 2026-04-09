import * as path from "node:path"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import { Writable } from "node:stream"
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
  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandy-docker-build-"))
  await fs.mkdir(`${stagingDir}/bootstrap`, { recursive: true })
  await fs.mkdir(`${stagingDir}/bootstrap/certs`, { recursive: true })

  await Promise.all([
    fs.copyFile(initShPath, `${stagingDir}/bootstrap/init.sh`),
    fs.copyFile(nodeCertsShPath, `${stagingDir}/bootstrap/node_certs.sh`),
    fs.copyFile(bootstrapPackageJsonPath, `${stagingDir}/bootstrap/package.json`),
    fs.copyFile(bootstrapTsconfigJsonPath, `${stagingDir}/bootstrap/tsconfig.json`),
    fs.copyFile(entrypointPath, `${stagingDir}/bootstrap/entrypoint`),
    fs.writeFile(`${stagingDir}/Dockerfile`, generateDockerfile()),
  ])

  // Copy Netskope cert if present
  try {
    await fs.copyFile(NETSKOPE_CERT_PATH, `${stagingDir}/bootstrap/certs/nscacert.pem`)
    process.stderr.write("sandy: Netskope certificate staged for installation\n")
  } catch {
    process.stderr.write("sandy: Netskope certificate not found, skipping\n")
  }

  const proc = Bun.spawn(["tar", "-c", "."], { cwd: stagingDir, stdout: "pipe", stderr: "pipe" })
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

  async run(opts: RunOptions, onProgress: (message: string) => void): Promise<RunResult> {
    const scriptDir = path.dirname(path.resolve(opts.scriptPath))
    const scriptName = path.basename(opts.scriptPath, ".ts")
    const compiledPath = `/workspace/dist/scripts/${scriptName}.js`
    const imdsEndpoint = `http://host.docker.internal:${opts.imdsPort}`

    const env: Record<string, string> = {
      [ENV_ENDPOINT]: imdsEndpoint,
      [ENV_ENDPOINT_MODE]: ENV_ENDPOINT_MODE_VALUE,
      [ENV_V1_DISABLED]: ENV_V1_DISABLED_VALUE,
      [ENV_REGION]: opts.region ?? DEFAULT_REGION,
      [ENV_SANDY_OUTPUT]: VM_OUTPUT_DIR,
    }

    const container = await this.docker.createContainer({
      Image: IMAGE_NAME,
      Cmd: ["sh", "-l", "/workspace/entrypoint", compiledPath, ...(opts.scriptArgs ?? [])],
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Binds: [`${scriptDir}:${VM_SCRIPTS_DIR}:ro`, `${opts.sessionDir}:${VM_OUTPUT_DIR}:rw`],
        // host.docker.internal resolves on macOS/Windows by default; on Linux the
        // host-gateway alias is required to make it resolve to the Docker bridge IP.
        ExtraHosts: ["host.docker.internal:host-gateway"],
      },
    })

    let stdoutBuf = ""
    let stderrBuf = ""

    await container.start()

    const logStream = await container.logs({ follow: true, stdout: true, stderr: true })

    await new Promise<void>((resolve) => {
      const stdoutWriter = new Writable({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          const text = chunk.toString()
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
          cb()
        },
      })

      const stderrWriter = new Writable({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          stderrBuf += chunk.toString()
          cb()
        },
      })

      this.docker.modem.demuxStream(logStream, stdoutWriter, stderrWriter)
      logStream.on("end", resolve)
    })

    const { StatusCode: exitCode } = await container.wait()

    if (exitCode !== 0) {
      process.stderr.write(`sandy: container ${container.id} exited with code ${exitCode}\n`)
    }

    await container.remove()

    return { exitCode, stdout: stdoutBuf, stderr: stderrBuf, outputFiles: [] }
  }
}
