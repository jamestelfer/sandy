import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"
import { extract as extractTar } from "tar-stream"
import type { DockerClientLike } from "./docker-backend"
import { DockerBackend, defaultBuildContextFactory } from "./docker-backend"
import { OutputHandler } from "./output-handler"
import { fakeBuildContext, makeDockerFake } from "./test-helpers"
import { makeTmpDir } from "./tmpdir"

describe("defaultBuildContextFactory", () => {
  test("produces a tar stream containing all bootstrap files and Dockerfile", async () => {
    await using contextStream = await defaultBuildContextFactory()

    const entries = new Set<string>()
    const extractor = extractTar()

    await new Promise<void>((resolve, reject) => {
      extractor.on("entry", (header, stream, next) => {
        entries.add(header.name)
        stream.on("end", next)
        stream.on("error", reject)
        stream.resume()
      })
      extractor.on("finish", resolve)
      extractor.on("error", reject)
      contextStream.on("error", reject)
      contextStream.pipe(extractor)
    })

    expect(entries.has("bootstrap/init.sh")).toBe(true)
    expect(entries.has("bootstrap/node_certs.sh")).toBe(true)
    expect(entries.has("bootstrap/package.json")).toBe(true)
    expect(entries.has("bootstrap/tsconfig.json")).toBe(true)
    expect(entries.has("bootstrap/entrypoint")).toBe(true)
    expect(entries.has("bootstrap/sandy.ts")).toBe(true)
    expect(entries.has("Dockerfile")).toBe(true)
  })
})

describe("DockerBackend.imageCreate", () => {
  test("does not fire progress callbacks after a build error frame", async () => {
    // Stream emits an error frame then a progress line. Without a rejected guard,
    // the data handler continues processing after reject() and fires onProgress.
    const errorLine = JSON.stringify({ error: "build failed" })
    const progressAfterError = JSON.stringify({ stream: "[-->  progress after error\n" })
    const { docker } = makeDockerFake()
    const errorDocker: DockerClientLike = {
      ...docker,
      buildImage: async (): Promise<NodeJS.ReadableStream> =>
        Readable.from([Buffer.from(`${errorLine}\n${progressAfterError}\n`)]),
    }
    const backend = new DockerBackend(errorDocker, fakeBuildContext)

    const progress: string[] = []
    await backend.imageCreate(new OutputHandler((msg) => progress.push(msg))).catch(() => {})

    expect(progress).toHaveLength(0)
  })

  test("calls buildImage with tag sandy:latest", async () => {
    const { docker, buildImageCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.imageCreate(new OutputHandler(() => {}))
    expect(buildImageCalls.length).toBe(1)
    expect((buildImageCalls[0]?.opts as { t?: string })?.t).toBe("sandy:latest")
  })

  test("tags sandy:layer-retention after successful build", async () => {
    const { docker, tagCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.imageCreate(new OutputHandler(() => {}))
    expect(tagCalls).toContainEqual({
      from: "sandy:latest",
      opts: { repo: "sandy", tag: "layer-retention" },
    })
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
    await backend.imageCreate(new OutputHandler((msg) => progress.push(msg)))
    expect(progress).toContain("building layer")
  })
})

describe("DockerBackend.imageDelete", () => {
  test("without force: removes only sandy:latest", async () => {
    const { docker, removedImages } = makeDockerFake()
    const backend = new DockerBackend(docker)
    await backend.imageDelete(new OutputHandler(() => {}))
    expect(removedImages).toEqual(["sandy:latest"])
  })

  test("without force: does not remove sandy:layer-retention", async () => {
    const { docker, removedImages } = makeDockerFake()
    const backend = new DockerBackend(docker)
    await backend.imageDelete(new OutputHandler(() => {}), false)
    expect(removedImages).not.toContain("sandy:layer-retention")
  })

  test("with force: removes sandy:latest and sandy:layer-retention", async () => {
    const { docker, removedImages } = makeDockerFake()
    const backend = new DockerBackend(docker)
    await backend.imageDelete(new OutputHandler(() => {}), true)
    expect(removedImages).toEqual(["sandy:latest", "sandy:layer-retention"])
  })
})

const baseRunOpts = {
  scriptPath: "/home/user/.sandy/test-session/scripts/hello.ts",
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
    await backend.run(baseRunOpts, new OutputHandler(() => {}))
    const opts = createContainerCalls[0]?.opts as ContainerOpts
    expect(opts?.Cmd).toEqual(["/workspace/dist/scripts/hello.js"])
    expect(opts?.Entrypoint).toBeUndefined()
  })

  test("creates container with Image sandy:latest", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, new OutputHandler(() => {}))
    expect(createContainerCalls.length).toBe(1)
    expect((createContainerCalls[0]?.opts as ContainerOpts)?.Image).toBe("sandy:latest")
  })

  test("sets IMDS endpoint to http://host.docker.internal:<port>", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run({ ...baseRunOpts, imdsPort: 9001 }, new OutputHandler(() => {}))
    const env = (createContainerCalls[0]?.opts as ContainerOpts)?.Env ?? []
    expect(env).toContain("AWS_EC2_METADATA_SERVICE_ENDPOINT=http://host.docker.internal:9001")
  })

  test("sets all AWS env vars in container", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run({ ...baseRunOpts, region: "ap-southeast-2" }, new OutputHandler(() => {}))
    const env = (createContainerCalls[0]?.opts as ContainerOpts)?.Env ?? []
    expect(env).toContain("AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE=IPv4")
    expect(env).toContain("AWS_EC2_METADATA_V1_DISABLED=true")
    expect(env).toContain("AWS_REGION=ap-southeast-2")
    expect(env).toContain("SANDY_OUTPUT=/workspace/output")
  })

  test("defaults region to us-west-2 when not provided", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run({ ...baseRunOpts, region: undefined }, new OutputHandler(() => {}))
    const env = (createContainerCalls[0]?.opts as ContainerOpts)?.Env ?? []
    expect(env).toContain("AWS_REGION=us-west-2")
  })

  test("mounts session scripts dir read-only and session output dir read-write", async () => {
    const { docker, createContainerCalls } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, new OutputHandler(() => {}))
    const binds = (createContainerCalls[0]?.opts as ContainerOpts)?.HostConfig?.Binds ?? []
    expect(binds).toContain("/home/user/.sandy/test-session/scripts:/workspace/scripts:ro")
    expect(binds).toContain("/home/user/.sandy/test-session/output:/workspace/output:rw")
  })

  test("forwards [-->-prefixed stdout lines as progress", async () => {
    const { docker } = makeDockerFake({
      containerConfig: { stdoutLines: ["[-->  compiling...", "normal output line"] },
    })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const progress: string[] = []
    await backend.run(baseRunOpts, new OutputHandler((msg) => progress.push(msg)))
    expect(progress).toContain("compiling...")
    expect(progress.join("\n")).not.toContain("normal output line")
  })

  test("collects output into RunResult and captures exit code", async () => {
    const { docker } = makeDockerFake({
      containerConfig: { exitCode: 2, stdoutLines: ["line one", "line two"] },
    })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const result = await backend.run(baseRunOpts, new OutputHandler(() => {}))
    expect(result.output).toContain("line one")
    expect(result.output).toContain("line two")
    expect(result.exitCode).toBe(2)
  })

  test("routes container stderr output to stderrLine, appears with [err] prefix", async () => {
    const { docker } = makeDockerFake({
      containerConfig: { stderrLines: ["container error"] },
    })
    const backend = new DockerBackend(docker, fakeBuildContext)
    const result = await backend.run(baseRunOpts, new OutputHandler(() => {}))
    expect(result.output).toContain("[err] container error")
  })

  test("removes container after run completes", async () => {
    const { docker, lastContainer } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    await backend.run(baseRunOpts, new OutputHandler(() => {}))
    expect(lastContainer().removeCalls).toBe(1)
  })

  test("outputFiles includes files created during the run, not pre-existing ones", async () => {
    await using tmpDir = await makeTmpDir("sandy-docker-run-test-")
    const outputDir = join(tmpDir.path, "output")
    await fs.mkdir(outputDir, { recursive: true })

    // pre-existing file written before the backend run starts
    await fs.writeFile(join(outputDir, "pre-existing.json"), "{}")

    // custom docker fake that writes a new file during container.start()
    const { docker } = makeDockerFake()
    const writingDocker: DockerClientLike = {
      ...docker,
      createContainer: async (opts) => {
        const container = await docker.createContainer(opts)
        return {
          ...container,
          start: async () => {
            await fs.writeFile(join(outputDir, "result.json"), "{}")
            return container.start()
          },
        }
      },
    }

    const backend = new DockerBackend(writingDocker, fakeBuildContext)
    const result = await backend.run(
      { ...baseRunOpts, sessionDir: tmpDir.path },
      new OutputHandler(() => {}),
    )
    expect(result.outputFiles).toContain("result.json")
    expect(result.outputFiles).not.toContain("pre-existing.json")
  })

  test("returns empty outputFiles when sessionDir does not exist", async () => {
    const { docker } = makeDockerFake()
    const backend = new DockerBackend(docker, fakeBuildContext)
    const result = await backend.run(
      { ...baseRunOpts, sessionDir: "/nonexistent/path/that/does/not/exist" },
      new OutputHandler(() => {}),
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
      await backend.run(baseRunOpts, new OutputHandler(() => {}))
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
    expect(await backend.imageExists(new OutputHandler(() => {}))).toBe(true)
  })

  test("returns false when sandy:latest does not exist", async () => {
    const { docker } = makeDockerFake({ imageConfig: { inspectThrows: true } })
    const backend = new DockerBackend(docker)
    expect(await backend.imageExists(new OutputHandler(() => {}))).toBe(false)
  })
})
