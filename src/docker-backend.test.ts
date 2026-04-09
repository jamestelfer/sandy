import { describe, expect, test } from "bun:test"
import { DockerBackend } from "./docker-backend"
import type { DockerClientLike, ImageLike, ContainerLike } from "./docker-backend"

function makeImageFake(config: { inspectThrows?: boolean } = {}): {
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
  }
  return { image, removeCalls }
}

function makeDockerFake(config: { imageConfig?: { inspectThrows?: boolean } } = {}): {
  docker: DockerClientLike
  buildImageCalls: Array<{ opts: object }>
  createContainerCalls: Array<{ opts: object }>
  imageFake: ReturnType<typeof makeImageFake>
} {
  const buildImageCalls: Array<{ opts: object }> = []
  const createContainerCalls: Array<{ opts: object }> = []
  const imageFake = makeImageFake(config.imageConfig)

  const docker: DockerClientLike = {
    getImage: (_name: string) => imageFake.image,
    buildImage: async (
      _context: NodeJS.ReadableStream,
      opts: object,
    ): Promise<NodeJS.ReadableStream> => {
      buildImageCalls.push({ opts })
      const { Readable } = await import("node:stream")
      return Readable.from([])
    },
    createContainer: async (opts: object): Promise<ContainerLike> => {
      createContainerCalls.push({ opts })
      return makeContainerFake()
    },
    modem: {
      demuxStream: (
        _stream: NodeJS.ReadableStream,
        _stdout: NodeJS.WritableStream,
        _stderr: NodeJS.WritableStream,
      ) => {},
    },
  }

  return {
    docker,
    buildImageCalls,
    createContainerCalls,
    imageFake,
  }
}

function makeContainerFake(config: {
  exitCode?: number
  stdoutLines?: string[]
} = {}): ContainerLike {
  const container: ContainerLike = {
    id: "test-container-id",
    start: async () => {},
    logs: async (): Promise<NodeJS.ReadableStream> => {
      const { Readable } = await import("node:stream")
      const lines = config.stdoutLines ?? []
      return Readable.from(lines.map((l) => `${l}\n`).join(""))
    },
    wait: async () => ({ StatusCode: config.exitCode ?? 0 }),
    remove: async () => {},
  }
  return container
}

describe("DockerBackend.imageDelete", () => {
  test("calls remove on sandy:latest", async () => {
    const { docker, imageFake } = makeDockerFake()
    const backend = new DockerBackend(docker)
    await backend.imageDelete()
    expect(imageFake.removeCalls.length).toBe(1)
  })
})

describe("DockerBackend.imageExists", () => {
  test("returns true when sandy:latest can be inspected", async () => {
    const { docker } = makeDockerFake()
    const backend = new DockerBackend(docker)
    expect(await backend.imageExists()).toBe(true)
  })

  test("returns false when sandy:latest does not exist", async () => {
    const { docker } = makeDockerFake({ imageConfig: { inspectThrows: true } })
    const backend = new DockerBackend(docker)
    expect(await backend.imageExists()).toBe(false)
  })
})
