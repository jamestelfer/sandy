import { describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { Readable } from "node:stream"
import { DockerBackend, defaultBuildContextFactory, generateDockerfile } from "./docker-backend"
import type {
  BuildContextFactory,
  DockerClientLike,
  ImageLike,
  ContainerLike,
} from "./docker-backend"

const fakeBuildContext: BuildContextFactory = async () =>
  Object.assign(Readable.from([]), { [Symbol.asyncDispose]: async () => {} })

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
      const { Readable } = await import("node:stream")
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

// Build a Docker multiplexed log frame: 1-byte type (1=stdout, 2=stderr), 3 pad, 4-byte big-endian size, payload
function dockerFrame(type: 1 | 2, payload: string): Buffer {
  const body = Buffer.from(payload)
  const header = Buffer.alloc(8)
  header[0] = type
  header.writeUInt32BE(body.length, 4)
  return Buffer.concat([header, body])
}

function makeContainerFake(
  config: { exitCode?: number; stdoutLines?: string[]; stderrLines?: string[] } = {},
): ContainerLike & { removeCalls: number } {
  let removeCalls = 0
  const container = {
    id: "test-container-id",
    start: async () => {},
    logs: async (): Promise<NodeJS.ReadableStream> => {
      const { Readable } = await import("node:stream")
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

describe("defaultBuildContextFactory", () => {
  test("produces a tar stream containing all bootstrap files and Dockerfile", async () => {
    const contextStream = await defaultBuildContextFactory()

    const tarList = spawn("tar", ["-t"])
    if (!tarList.stdin) {
      throw new Error("tar stdin is null")
    }
    contextStream.pipe(tarList.stdin)

    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      tarList.stdout.on("data", (c: Buffer) => chunks.push(c))
      tarList.stdout.on("end", resolve)
      tarList.stdout.on("error", reject)
    })
    const listing = Buffer.concat(chunks).toString()

    expect(listing).toContain("bootstrap/init.sh")
    expect(listing).toContain("bootstrap/node_certs.sh")
    expect(listing).toContain("bootstrap/package.json")
    expect(listing).toContain("bootstrap/tsconfig.json")
    expect(listing).toContain("bootstrap/entrypoint")
    expect(listing).toContain("bootstrap/sandy.ts")
    expect(listing).toContain("Dockerfile")
  })
})

describe("generateDockerfile", () => {
  test("COPYs bootstrap dir to /tmp/bootstrap", () => {
    const df = generateDockerfile()
    expect(df).toMatch(/COPY bootstrap\/ \/tmp\/bootstrap\//)
  })

  test("RUNs each init.sh step as a separate layer", () => {
    const df = generateDockerfile()
    for (const step of [
      "prerequisites",
      "certificates",
      "nodejs",
      "pnpm",
      "workspace",
      "profiles",
      "dependencies",
    ]) {
      expect(df).toContain(`RUN sh /tmp/bootstrap/init.sh ${step}`)
    }
  })

  test("sets cert bundle ENV vars before init steps, mirroring node_certs.sh", () => {
    const df = generateDockerfile()
    const certBundle = "/etc/ssl/certs/ca-certificates.crt"
    for (const key of [
      "NIX_SSL_CERT_FILE",
      "AWS_CA_BUNDLE",
      "CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE",
      "CURL_CA_BUNDLE",
      "GRPC_DEFAULT_SSL_ROOTS_FILE_PATH",
      "NODE_EXTRA_CA_CERTS",
      "PIP_CERT",
      "REQUESTS_CA_BUNDLE",
      "SSL_CERT_FILE",
      "GIT_SSL_CAINFO",
    ]) {
      expect(df).toContain(`${key}=${certBundle}`)
    }
    // ENV block must appear before the first RUN init.sh step
    const envPos = df.indexOf(`NODE_EXTRA_CA_CERTS=${certBundle}`)
    const firstRunPos = df.indexOf("RUN sh /tmp/bootstrap/init.sh prerequisites")
    expect(envPos).toBeLessThan(firstRunPos)
  })

  test("sets WORKDIR to /workspace so pnpm can find package.json", () => {
    const df = generateDockerfile()
    expect(df).toContain("WORKDIR /workspace")
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
    await backend.imageCreate(() => {})
    expect(buildImageCalls.length).toBe(1)
    expect((buildImageCalls[0]?.opts as { t?: string })?.t).toBe("sandy:latest")
  })

  test("forwards [-->-prefixed stream content as progress", async () => {
    // Build stream returning JSON with [-->-prefixed stream content
    const buildLine = JSON.stringify({ stream: "[-->  building layer\n" })
    const { docker } = makeDockerFake()
    const fakeContextWithProgress: BuildContextFactory = async () =>
      Object.assign(Readable.from([]), { [Symbol.asyncDispose]: async () => {} })
    // Override buildImage to return a stream with progress content
    const progressDocker: DockerClientLike = {
      ...docker,
      buildImage: async (): Promise<NodeJS.ReadableStream> =>
        Readable.from([Buffer.from(`${buildLine}\n`)]),
    }
    const backend = new DockerBackend(progressDocker, fakeContextWithProgress)
    const progress: string[] = []
    await backend.imageCreate((msg) => progress.push(msg))
    expect(progress).toContain("building layer")
  })
})

describe("DockerBackend.imageDelete", () => {
  test("calls remove on sandy:latest", async () => {
    const { docker, imageFake } = makeDockerFake()
    const backend = new DockerBackend(docker)
    await backend.imageDelete(() => {})
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
  Entrypoint?: string[]
  Cmd?: string[]
  Env?: string[]
  HostConfig?: { Binds?: string[]; ExtraHosts?: string[] }
}

describe("DockerBackend.run", () => {
  test("passes compiled script path as Cmd so Dockerfile ENTRYPOINT receives it as argument", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, () => {})
    const opts = createContainerCalls[0]?.opts as ContainerOpts
    expect(opts?.Cmd).toEqual(["/workspace/dist/scripts/hello.js"])
    expect(opts?.Entrypoint).toBeUndefined()
  })

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

  test("collects output into RunResult and captures exit code", async () => {
    const { docker } = makeDockerFake({
      containerConfig: { exitCode: 2, stdoutLines: ["line one", "line two"] },
    })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const result = await backend.run(baseRunOpts, () => {})
    expect(result.output).toContain("line one")
    expect(result.output).toContain("line two")
    expect(result.exitCode).toBe(2)
  })

  test("routes container stderr output to stderrLine, appears with [err] prefix", async () => {
    const { docker } = makeDockerFake({
      containerConfig: { stderrLines: ["container error"] },
    })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const result = await backend.run(baseRunOpts, () => {})
    expect(result.output).toContain("[err] container error")
  })

  test("removes container after run completes", async () => {
    const { docker, lastContainer } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, () => {})
    expect(lastContainer().removeCalls).toBe(1)
  })

  test("outputFiles includes files created during the run, not pre-existing ones", async () => {
    const tmpDir = join(import.meta.dir, "../.tmp-test-docker-run")
    mkdirSync(tmpDir, { recursive: true })
    try {
      // pre-existing file written before the backend run starts
      writeFileSync(join(tmpDir, "pre-existing.json"), "{}")

      // custom docker fake that writes a new file during container.start()
      const { docker } = makeDockerFake()
      const writingDocker: DockerClientLike = {
        ...docker,
        createContainer: async (opts) => {
          const container = await docker.createContainer(opts)
          return {
            ...container,
            start: async () => {
              writeFileSync(join(tmpDir, "result.json"), "{}")
              return container.start()
            },
          }
        },
      }

      const backend = new DockerBackend(writingDocker, fakeBuildContext)
      const result = await backend.run({ ...baseRunOpts, sessionDir: tmpDir }, () => {})
      expect(result.outputFiles).toContain("result.json")
      expect(result.outputFiles).not.toContain("pre-existing.json")
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test("returns empty outputFiles when sessionDir does not exist", async () => {
    const { docker } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    const result = await backend.run(
      { ...baseRunOpts, sessionDir: "/nonexistent/path/that/does/not/exist" },
      () => {},
    )
    expect(result.outputFiles).toEqual([])
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
    expect(await backend.imageExists(() => {})).toBe(true)
  })

  test("returns false when sandy:latest does not exist", async () => {
    const { docker } = makeDockerFake({ imageConfig: { inspectThrows: true } })
    const backend = new DockerBackend(docker)
    expect(await backend.imageExists(() => {})).toBe(false)
  })
})
