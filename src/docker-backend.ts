import * as path from "node:path"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import { spawn } from "node:child_process"
import { Writable } from "node:stream"
import { makeTmpDir } from "./tmpdir"
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

export type BuildContextFactory = () => Promise<NodeJS.ReadableStream & AsyncDisposable>

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

export async function defaultBuildContextFactory(): Promise<NodeJS.ReadableStream & AsyncDisposable> {
  const staging = await makeTmpDir("sandy-docker-build-")
  await fs.mkdir(`${staging.path}/bootstrap`, { recursive: true })
  await fs.mkdir(`${staging.path}/bootstrap/certs`, { recursive: true })

  // Use Bun.file().arrayBuffer() instead of fs.copyFile() so this works when
  // the binary is compiled — embedded bunfs paths are not accessible to the OS.
  async function copyEmbedded(src: string, dest: string): Promise<void> {
    const buf = await Bun.file(src).arrayBuffer()
    await fs.writeFile(dest, new Uint8Array(buf))
  }

  await Promise.all([
    copyEmbedded(initShPath, `${staging.path}/bootstrap/init.sh`),
    copyEmbedded(nodeCertsShPath, `${staging.path}/bootstrap/node_certs.sh`),
    copyEmbedded(bootstrapPackageJsonPath, `${staging.path}/bootstrap/package.json`),
    copyEmbedded(bootstrapTsconfigJsonPath, `${staging.path}/bootstrap/tsconfig.json`),
    copyEmbedded(entrypointPath, `${staging.path}/bootstrap/entrypoint`),
    fs.writeFile(`${staging.path}/Dockerfile`, generateDockerfile()),
  ])

  // Copy Netskope cert if present
  try {
    await fs.copyFile(NETSKOPE_CERT_PATH, `${staging.path}/bootstrap/certs/nscacert.pem`)
    process.stderr.write("sandy: Netskope certificate staged for installation\n")
  } catch {
    process.stderr.write("sandy: Netskope certificate not found, skipping\n")
  }

  // Attach staging dir cleanup to the stream so the caller can dispose after
  // Docker finishes reading — no need to buffer the tar in memory.
  const proc = spawn("tar", ["-c", "."], { cwd: staging.path })
  if (!proc.stdout) { throw new Error("tar process has no stdout") }
  return Object.assign(proc.stdout, { [Symbol.asyncDispose]: () => staging[Symbol.asyncDispose]() })
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
    await using context = await this.buildContext()
    const stream = await this.docker.buildImage(context, { t: IMAGE_NAME })
    // Parse build output JSON and surface Docker errors
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (!line.trim()) { continue }
          try {
            const msg = JSON.parse(line) as { stream?: string; error?: string }
            if (msg.stream) { process.stderr.write(msg.stream) }
            if (msg.error) { reject(new Error(`docker build: ${msg.error.trim()}`)) }
          } catch {
            // non-JSON line, ignore
          }
        }
      })
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
        // No network restrictions: Docker does not support domain-based allow-lists
        // without a custom DNS proxy. This is a known trade-off vs the Shuru backend,
        // which restricts egress to *.amazonaws.com and *.aws.amazon.com.
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
