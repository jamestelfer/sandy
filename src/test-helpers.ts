// Shared test fakes for docker-backend.test.ts and shuru-backend.test.ts.
// All factories return typed interfaces so tests stay decoupled from implementation details.

import { Readable } from "node:stream"
import type { StartOptions } from "@superhq/shuru"
import type {
  BuildContextFactory,
  ContainerLike,
  DockerClientLike,
  ImageLike,
} from "./docker-backend"
import type { ShellExecutor, SandboxFactory } from "./shuru-backend"

// ── Docker fakes ─────────────────────────────────────────────────────────────

export const fakeBuildContext: BuildContextFactory = async () =>
  Object.assign(Readable.from([]), { [Symbol.asyncDispose]: async () => {} })

export function makeImageFake(config: { inspectThrows?: boolean } = {}): {
  image: ImageLike
  removeCalls: string[]
} {
  const removeCalls: string[] = []
  const image: ImageLike = {
    inspect: async () => {
      if (config.inspectThrows) {
        throw new Error("No such image")
      }
      return {}
    },
    remove: async () => {
      removeCalls.push("remove")
    },
    tag: async () => {},
  }
  return { image, removeCalls }
}

export function makeContainerFake(
  config: { exitCode?: number; stdoutLines?: string[]; stderrLines?: string[] } = {},
): ContainerLike & { removeCalls: number } {
  let removeCalls = 0
  const container = {
    id: "test-container-id",
    start: async () => {},
    logs: async (): Promise<NodeJS.ReadableStream> => {
      const frames: Buffer[] = []
      for (const line of config.stdoutLines ?? []) {
        frames.push(dockerFrame(1, `${line}\n`))
      }
      for (const line of config.stderrLines ?? []) {
        frames.push(dockerFrame(2, `${line}\n`))
      }
      return Readable.from(Buffer.concat(frames))
    },
    wait: async () => ({ StatusCode: config.exitCode ?? 0 }),
    remove: async () => {
      removeCalls++
    },
    get removeCalls() {
      return removeCalls
    },
  }
  return container
}

export function makeDockerFake(
  config: {
    imageConfig?: { inspectThrows?: boolean }
    containerConfig?: { exitCode?: number; stdoutLines?: string[]; stderrLines?: string[] }
  } = {},
): {
  docker: DockerClientLike
  buildImageCalls: Array<{ opts: object }>
  createContainerCalls: Array<{ opts: object }>
  imageFake: ReturnType<typeof makeImageFake>
  lastContainer: () => ReturnType<typeof makeContainerFake>
} {
  const buildImageCalls: Array<{ opts: object }> = []
  const createContainerCalls: Array<{ opts: object }> = []
  const imageFake = makeImageFake(config.imageConfig)
  let lastContainer: ReturnType<typeof makeContainerFake> | null = null

  const docker: DockerClientLike = {
    getImage: (_name: string) => imageFake.image,
    buildImage: async (
      _context: NodeJS.ReadableStream,
      opts: object,
    ): Promise<NodeJS.ReadableStream> => {
      buildImageCalls.push({ opts })
      return Readable.from([])
    },
    createContainer: async (opts: object): Promise<ContainerLike> => {
      createContainerCalls.push({ opts })
      lastContainer = makeContainerFake(config.containerConfig)
      return lastContainer
    },
  }

  return {
    docker,
    buildImageCalls,
    createContainerCalls,
    imageFake,
    lastContainer: () => {
      if (!lastContainer) {
        throw new Error("createContainer was not called")
      }
      return lastContainer
    },
  }
}

// Build a Docker multiplexed log frame:
// 1-byte type (1=stdout, 2=stderr), 3 pad bytes, 4-byte big-endian size, payload.
export function dockerFrame(type: 1 | 2, payload: string): Buffer {
  const body = Buffer.from(payload)
  const header = Buffer.alloc(8)
  header[0] = type
  header.writeUInt32BE(body.length, 4)
  return Buffer.concat([header, body])
}

// ── Shuru fakes ──────────────────────────────────────────────────────────────

export function makeSandboxFactory(config: { exitCode?: number; stdoutLines?: string[] } = {}): {
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

export function makeExecutor(
  responses: Record<string, { stdout: string; stderr: string; exitCode: number }> = {},
  stdoutLines: string[] = [],
): { executor: ShellExecutor; calls: string[][] } {
  const calls: string[][] = []
  const executor: ShellExecutor = async (cmd, opts) => {
    calls.push(cmd)
    if (opts?.handler) {
      for (const line of stdoutLines) {
        opts.handler.stdoutLine(line)
      }
    }
    return responses[cmd.join(" ")] ?? { stdout: "", stderr: "", exitCode: 0 }
  }
  return { executor, calls }
}
