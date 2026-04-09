import { describe, expect, test } from "bun:test"
import { Readable } from "node:stream"
import { DockerBackend, generateDockerfile } from "./docker-backend"
import type { BuildContextFactory, DockerClientLike, ImageLike, ContainerLike } from "./docker-backend"

const fakeBuildContext: BuildContextFactory = async () => Readable.from([])

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
      // Fake demuxStream: pipe directly to stdout (no Docker multiplexing header in test)
      demuxStream: (
        stream: NodeJS.ReadableStream,
        stdout: NodeJS.WritableStream,
        _stderr: NodeJS.WritableStream,
      ) => {
        stream.pipe(stdout)
      },
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

describe("generateDockerfile", () => {
  test("COPYs bootstrap dir to /tmp/bootstrap", () => {
    const df = generateDockerfile()
    expect(df).toMatch(/COPY bootstrap\/ \/tmp\/bootstrap\//)
  })

  test("RUNs init.sh from /tmp/bootstrap", () => {
    const df = generateDockerfile()
    expect(df).toContain("sh /tmp/bootstrap/init.sh")
  })

  test("sets ENTRYPOINT to pnpm run -s entrypoint", () => {
    const df = generateDockerfile()
    expect(df).toContain('ENTRYPOINT ["pnpm", "run", "-s", "entrypoint"]')
  })
})

describe("DockerBackend.imageCreate", () => {
  test("calls buildImage with tag sandy:latest", async () => {
    const { docker, buildImageCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.imageCreate()
    expect(buildImageCalls.length).toBe(1)
    expect((buildImageCalls[0]?.opts as { t?: string })?.t).toBe("sandy:latest")
  })
})

describe("DockerBackend.imageDelete", () => {
  test("calls remove on sandy:latest", async () => {
    const { docker, imageFake } = makeDockerFake()
    const backend = new DockerBackend(docker)
    await backend.imageDelete()
    expect(imageFake.removeCalls.length).toBe(1)
  })
})

const baseRunOpts = {
  scriptPath: "/home/user/scripts/hello.ts",
  imdsPort: 9001,
  session: "test-session",
  sessionDir: "/home/user/.sandy/test-session",
  scriptArgs: [] as string[],
}

describe("DockerBackend.run", () => {
  test("creates container with Image sandy:latest", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, () => {})
    expect(createContainerCalls.length).toBe(1)
    expect((createContainerCalls[0]?.opts as { Image?: string })?.Image).toBe("sandy:latest")
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
