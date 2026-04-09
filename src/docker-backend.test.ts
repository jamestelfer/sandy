import { describe, expect, test } from "bun:test"
import { Readable } from "node:stream"
import { DockerBackend, generateDockerfile } from "./docker-backend"
import type {
  BuildContextFactory,
  DockerClientLike,
  ImageLike,
  ContainerLike,
} from "./docker-backend"

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

function makeDockerFake(
  config: {
    imageConfig?: { inspectThrows?: boolean }
    containerConfig?: { exitCode?: number; stdoutLines?: string[] }
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
      const { Readable } = await import("node:stream")
      return Readable.from([])
    },
    createContainer: async (opts: object): Promise<ContainerLike> => {
      createContainerCalls.push({ opts })
      lastContainer = makeContainerFake(config.containerConfig)
      return lastContainer
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
    lastContainer: () => {
      if (!lastContainer) {
        throw new Error("createContainer was not called")
      }
      return lastContainer
    },
  }
}

function makeContainerFake(
  config: { exitCode?: number; stdoutLines?: string[] } = {},
): ContainerLike & { removeCalls: number } {
  let removeCalls = 0
  const container = {
    id: "test-container-id",
    start: async () => {},
    logs: async (): Promise<NodeJS.ReadableStream> => {
      const { Readable } = await import("node:stream")
      const lines = config.stdoutLines ?? []
      return Readable.from(lines.map((l) => `${l}\n`).join(""))
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

type ContainerOpts = {
  Image?: string
  Env?: string[]
  HostConfig?: { Binds?: string[]; ExtraHosts?: string[] }
}

describe("DockerBackend.run", () => {
  test("creates container with Image sandy:latest", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, () => {})
    expect(createContainerCalls.length).toBe(1)
    expect((createContainerCalls[0]?.opts as ContainerOpts)?.Image).toBe("sandy:latest")
  })

  test("sets IMDS endpoint to http://host.docker.internal:<port>", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run({ ...baseRunOpts, imdsPort: 9001 }, () => {})
    const env = (createContainerCalls[0]?.opts as ContainerOpts)?.Env ?? []
    expect(env).toContain("AWS_EC2_METADATA_SERVICE_ENDPOINT=http://host.docker.internal:9001")
  })

  test("sets all AWS env vars in container", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run({ ...baseRunOpts, region: "ap-southeast-2" }, () => {})
    const env = (createContainerCalls[0]?.opts as ContainerOpts)?.Env ?? []
    expect(env).toContain("AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE=IPv4")
    expect(env).toContain("AWS_EC2_METADATA_V1_DISABLED=true")
    expect(env).toContain("AWS_REGION=ap-southeast-2")
    expect(env).toContain("SANDY_OUTPUT=/workspace/output")
  })

  test("defaults region to us-west-2 when not provided", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run({ ...baseRunOpts, region: undefined }, () => {})
    const env = (createContainerCalls[0]?.opts as ContainerOpts)?.Env ?? []
    expect(env).toContain("AWS_REGION=us-west-2")
  })

  test("mounts script dir read-only and session dir read-write", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    // scriptPath /home/user/scripts/hello.ts → scriptDir /home/user/scripts
    await backend.run(baseRunOpts, () => {})
    const binds = (createContainerCalls[0]?.opts as ContainerOpts)?.HostConfig?.Binds ?? []
    expect(binds).toContain("/home/user/scripts:/workspace/scripts:ro")
    expect(binds).toContain("/home/user/.sandy/test-session:/workspace/output:rw")
  })

  test("forwards [-->-prefixed stdout lines as progress", async () => {
    const { docker } = makeDockerFake({
      containerConfig: { stdoutLines: ["[-->  compiling...", "normal output line"] },
    })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const progress: string[] = []
    await backend.run(baseRunOpts, (msg) => progress.push(msg))
    expect(progress).toContain("compiling...")
    expect(progress.join("\n")).not.toContain("normal output line")
  })

  test("collects stdout into RunResult and captures exit code", async () => {
    const { docker } = makeDockerFake({
      containerConfig: { exitCode: 2, stdoutLines: ["line one", "line two"] },
    })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const result = await backend.run(baseRunOpts, () => {})
    expect(result.stdout).toContain("line one")
    expect(result.stdout).toContain("line two")
    expect(result.exitCode).toBe(2)
  })

  test("removes container after run completes", async () => {
    const { docker, lastContainer } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, () => {})
    expect(lastContainer().removeCalls).toBe(1)
  })

  test("logs container ID to stderr on non-zero exit", async () => {
    const { docker } = makeDockerFake({ containerConfig: { exitCode: 1 } })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const stderrOutput: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrOutput.push(chunk.toString())
      return true
    }
    try {
      await backend.run(baseRunOpts, () => {})
    } finally {
      process.stderr.write = originalWrite
    }
    expect(stderrOutput.join("")).toContain("test-container-id")
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
