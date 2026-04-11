import * as path from "node:path"
import * as fs from "node:fs/promises"
import { spawn } from "node:child_process"
import { makeTmpDir } from "./tmpdir"
import type { Backend } from "./backend"
import type { RunOptions, RunResult } from "./types"
import { VM_BOOTSTRAP, VM_OUTPUT_DIR, VM_SCRIPTS_DIR } from "./types"
import type { ProgressCallback } from "./types"
import { OutputHandler } from "./output-handler"
import { resolveScriptDir } from "./check-scripts"
import { OutputTracker } from "./scan-output"
import { buildRunEnv } from "./run-env"
import { stageBootstrapFiles } from "./bootstrap-staging"

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
}

export type BuildContextFactory = () => Promise<NodeJS.ReadableStream & AsyncDisposable>

const IMAGE_NAME = "sandy:latest"

const INIT_STEPS = [
  "prerequisites",
  "certificates",
  "nodejs",
  "pnpm",
  "workspace",
  "profiles",
  "dependencies",
] as const

// Mirrors node_certs.sh — baked into the image so the cert vars are set at both
// build time (pnpm install, curl, etc.) and container runtime.
const CERT_BUNDLE = "/etc/ssl/certs/ca-certificates.crt"
const DOCKERFILE_ENV = [
  `NIX_SSL_CERT_FILE=${CERT_BUNDLE}`,
  `AWS_CA_BUNDLE=${CERT_BUNDLE}`,
  `CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE=${CERT_BUNDLE}`,
  `CURL_CA_BUNDLE=${CERT_BUNDLE}`,
  `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH=${CERT_BUNDLE}`,
  `NODE_EXTRA_CA_CERTS=${CERT_BUNDLE}`,
  `PIP_CERT=${CERT_BUNDLE}`,
  `REQUESTS_CA_BUNDLE=${CERT_BUNDLE}`,
  `SSL_CERT_FILE=${CERT_BUNDLE}`,
  `GIT_SSL_CAINFO=${CERT_BUNDLE}`,
]
  .map((kv) => `    ${kv}`)
  .join(" \\\n")

export function generateDockerfile(): string {
  const runs = INIT_STEPS.map((step) => `RUN sh ${VM_BOOTSTRAP}/init.sh ${step}`).join("\n")
  return `FROM ubuntu:24.04
COPY bootstrap/ ${VM_BOOTSTRAP}/
ENV ${DOCKERFILE_ENV}
RUN chmod +x ${VM_BOOTSTRAP}/init.sh ${VM_BOOTSTRAP}/entrypoint
${runs}
WORKDIR /workspace
ENTRYPOINT ["pnpm", "run", "-s", "entrypoint"]
`
}

export async function defaultBuildContextFactory(): Promise<
  NodeJS.ReadableStream & AsyncDisposable
> {
  const staging = await makeTmpDir("sandy-docker-build-")
  await fs.mkdir(`${staging.path}/bootstrap`, { recursive: true })
  await Promise.all([
    stageBootstrapFiles(`${staging.path}/bootstrap`),
    fs.writeFile(`${staging.path}/Dockerfile`, generateDockerfile()),
  ])

  // Attach staging dir cleanup to the stream so the caller can dispose after
  // Docker finishes reading — no need to buffer the tar in memory.
  const proc = spawn("tar", ["-c", "."], { cwd: staging.path })
  if (!proc.stdout) {
    throw new Error("tar process has no stdout")
  }
  return Object.assign(proc.stdout, { [Symbol.asyncDispose]: () => staging[Symbol.asyncDispose]() })
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
        const payload = buf.slice(8, 8 + payloadSize)
        buf = buf.slice(8 + payloadSize)
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

  async imageExists(_onProgress: ProgressCallback): Promise<boolean> {
    try {
      await this.docker.getImage(IMAGE_NAME).inspect()
      return true
    } catch {
      return false
    }
  }

  async imageDelete(_onProgress: ProgressCallback): Promise<void> {
    await this.docker.getImage(IMAGE_NAME).remove()
  }

  async imageCreate(onProgress: ProgressCallback): Promise<void> {
    await using context = await this.buildContext()
    const stream = await this.docker.buildImage(context, { t: IMAGE_NAME })
    const handler = new OutputHandler(onProgress)
    // Parse build output JSON, feed stream content through OutputHandler (stderr + progress)
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => {
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
              reject(new Error(`docker build: ${msg.error.trim()}`))
            }
          } catch {
            // non-JSON line, ignore
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

  async run(opts: RunOptions, onProgress: ProgressCallback): Promise<RunResult> {
    await using scriptDirObj = await resolveScriptDir(opts.scriptPath)
    const scriptName = path.basename(opts.scriptPath, ".ts")
    const compiledPath = `/workspace/dist/scripts/${scriptName}.js`
    const imdsEndpoint = `http://host.docker.internal:${opts.imdsPort}`
    const env = buildRunEnv(opts, imdsEndpoint)

    const container = await this.docker.createContainer({
      Image: IMAGE_NAME,
      Cmd: [compiledPath, ...(opts.scriptArgs ?? [])],
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Binds: [
          `${scriptDirObj.path}:${VM_SCRIPTS_DIR}:ro`,
          `${opts.sessionDir}:${VM_OUTPUT_DIR}:rw`,
        ],
        // host.docker.internal resolves on macOS/Windows by default; on Linux the
        // host-gateway alias is required to make it resolve to the Docker bridge IP.
        ExtraHosts: ["host.docker.internal:host-gateway"],
        // No network restrictions: Docker does not support domain-based allow-lists
        // without a custom DNS proxy. This is a known trade-off vs the Shuru backend,
        // which restricts egress to *.amazonaws.com and *.aws.amazon.com.
      },
    })

    const tracker = await OutputTracker.create(opts.sessionDir)
    const handler = new OutputHandler(onProgress)

    await container.start()

    const logStream = await container.logs({ follow: true, stdout: true, stderr: true })

    await demuxDockerStream(logStream, handler)

    const waitResult = await container.wait()
    const exitCode = waitResult.StatusCode

    if (exitCode !== 0) {
      process.stderr.write(`sandy: container ${container.id} exited with code ${exitCode}\n`)
    }

    await container.remove()

    const outputFiles = await tracker.changed()

    return { exitCode, output: handler.output, outputFiles }
  }
}
