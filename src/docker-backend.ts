import type { Backend } from "./backend"
import type { RunOptions, RunResult } from "./types"

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

const IMAGE_NAME = "sandy:latest"

export class DockerBackend implements Backend {
  constructor(private docker: DockerClientLike) {}

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
    throw new Error("not implemented")
  }

  async run(_opts: RunOptions, _onProgress: (message: string) => void): Promise<RunResult> {
    throw new Error("not implemented")
  }
}
