import { readFileSync } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { pack as packTar } from "tar-fs"
import type { RunOptions, RunResult } from "../core/types"
import { VM_OUTPUT_DIR, VM_SCRIPTS_DIR } from "../core/types"
// Dockerfile — embedded in binary by Bun at build time
import dockerfilePath from "../docker/Dockerfile" with { type: "file" }
import { buildRunEnv } from "../execution/run-env"
import { OutputTracker } from "../execution/scan-output"
import type { OutputHandler } from "../output/handler"
import { stageBootstrapFiles } from "../resources/bootstrap-staging"
import { makeTmpDir } from "../resources/tmpdir"
import type { Backend } from "./backend"

const DOCKERFILE = readFileSync(dockerfilePath, "utf-8")

export interface ImageLike {
  inspect(): Promise<unknown>
  remove(): Promise<unknown>
  tag(opts: { repo: string; tag: string }): Promise<void>
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
}

export type BuildContextFactory = () => Promise<NodeJS.ReadableStream & AsyncDisposable>

const IMAGE_NAME = "sandy:latest"
const LAYER_RETENTION_IMAGE = "sandy:layer-retention"

export async function defaultBuildContextFactory(): Promise<
  NodeJS.ReadableStream & AsyncDisposable
> {
  const staging = await makeTmpDir("sandy-docker-build-")
  await fs.mkdir(`${staging.path}/bootstrap`, { recursive: true })
  await Promise.all([
    stageBootstrapFiles(`${staging.path}/bootstrap`),
    fs.writeFile(`${staging.path}/Dockerfile`, DOCKERFILE),
  ])

  // Attach staging dir cleanup to the stream so the caller can dispose after
  // Docker finishes reading — no need to buffer the tar in memory.
  const tarStream = packTar(staging.path)
  return Object.assign(tarStream, { [Symbol.asyncDispose]: () => staging[Symbol.asyncDispose]() })
}

// Parse Docker's multiplexed log stream format and route frames to OutputHandler.
// Format: 8-byte header (1-byte type: 1=stdout 2=stderr, 3 pad bytes, 4-byte big-endian size) + payload.
// The stream is consumed in flowing mode so the "end" event fires reliably.
async function demuxDockerStream(
  stream: NodeJS.ReadableStream,
  handler: OutputHandler,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0)

    stream.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      while (buf.length >= 8) {
        const payloadSize = buf.readUInt32BE(4)
        if (buf.length < 8 + payloadSize) {
          break
        }
        const type = buf[0]
        const payload = buf.subarray(8, 8 + payloadSize)
        buf = buf.subarray(8 + payloadSize)
        if (type === 1) {
          handler.feedStdout(payload)
        } else if (type === 2) {
          handler.feedStderr(payload)
        }
      }
    })

    stream.on("end", () => {
      handler.flush()
      resolve()
    })

    stream.on("error", reject)
  })
}

export class DockerBackend implements Backend {
  constructor(
    private docker: DockerClientLike,
    private buildContext: BuildContextFactory = defaultBuildContextFactory,
  ) {}

  async imageExists(_handler: OutputHandler): Promise<boolean> {
    try {
      await this.docker.getImage(IMAGE_NAME).inspect()
      return true
    } catch {
      return false
    }
  }

  async imageDelete(_handler: OutputHandler, force = false): Promise<void> {
    await this.docker.getImage(IMAGE_NAME).remove()
    if (force) {
      await this.docker.getImage(LAYER_RETENTION_IMAGE).remove()
    }
  }

  async imageCreate(handler: OutputHandler): Promise<void> {
    await using context = await this.buildContext()
    const stream = await this.docker.buildImage(context, { t: IMAGE_NAME })
    // Parse build output JSON, feed stream content through OutputHandler (stderr + progress)
    await new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (!line.trim()) {
            continue
          }
          try {
            const msg = JSON.parse(line) as { stream?: string; error?: string }
            if (msg.stream) {
              handler.feedStdout(Buffer.from(msg.stream))
            }
            if (msg.error) {
              stream.off("data", onData)
              reject(new Error(`docker build: ${msg.error.trim()}`))
              return
            }
          } catch {
            // non-JSON line, ignore
          }
        }
      }
      stream.on("data", onData)
      stream.on("end", () => {
        handler.flush()
        resolve()
      })
      stream.on("error", reject)
    })
    await this.docker.getImage(IMAGE_NAME).tag({ repo: "sandy", tag: "layer-retention" })
  }

  async run(opts: RunOptions, handler: OutputHandler): Promise<RunResult> {
    const sessionDir = path.resolve(opts.sessionDir)
    const scriptDirPath = path.join(sessionDir, "scripts")
    const outputDirPath = path.join(sessionDir, "output")
    const scriptName = path.basename(opts.scriptPath, ".ts")
    const compiledPath = `/workspace/dist/scripts/${scriptName}.js`
    const imdsEndpoint = `http://host.docker.internal:${opts.imdsPort}`
    const env = buildRunEnv(opts, imdsEndpoint)

    const container = await this.docker.createContainer({
      Image: IMAGE_NAME,
      Cmd: [compiledPath, ...(opts.scriptArgs ?? [])],
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Binds: [`${scriptDirPath}:${VM_SCRIPTS_DIR}:ro`, `${outputDirPath}:${VM_OUTPUT_DIR}:rw`],
        // host.docker.internal resolves on macOS/Windows by default; on Linux the
        // host-gateway alias is required to make it resolve to the Docker bridge IP.
        ExtraHosts: ["host.docker.internal:host-gateway"],
        // No network restrictions: Docker does not support domain-based allow-lists
        // without a custom DNS proxy. This is a known trade-off vs the Shuru backend,
        // which restricts egress to *.amazonaws.com and *.aws.amazon.com.
      },
    })

    const tracker = await OutputTracker.create(outputDirPath)

    try {
      await container.start()

      const logStream = await container.logs({ follow: true, stdout: true, stderr: true })

      await demuxDockerStream(logStream, handler)

      const waitResult = await container.wait()
      const exitCode = waitResult.StatusCode

      if (exitCode !== 0) {
        process.stderr.write(`sandy: container ${container.id} exited with code ${exitCode}\n`)
      }

      const outputFiles = await tracker.changed()

      return { exitCode, output: handler.output, outputFiles }
    } finally {
      await container.remove()
    }
  }
}
