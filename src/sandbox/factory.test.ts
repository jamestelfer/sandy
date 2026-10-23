import { describe, expect, it } from "bun:test"
import { OutputHandler } from "../output"
import { makeDockerFake } from "../test-support"
import { createBackend } from "./factory"

const baseRunOpts = {
  scriptPath: "/tmp/scripts/hello.ts",
  imdsPort: 9001,
  session: "test-session",
  sessionDir: "/tmp/test-session",
}

describe("createBackend", () => {
  it("returns a ShuruBackend when backend is shuru", async () => {
    const backend = await createBackend({
      readConfig: async () => ({ backend: "shuru" }),
    })

    expect(backend.constructor.name).toBe("ShuruBackend")
  })

  it("returns a DockerBackend wired to the factory's docker client", async () => {
    const { docker, removedImages } = makeDockerFake()

    const backend = await createBackend({
      readConfig: async () => ({ backend: "docker" }),
      dockerFactory: () => docker,
      resolveEndpoint: () => ({ options: undefined, source: "test" }),
    })

    expect(backend.constructor.name).toBe("DockerBackend")
    await backend.imageDelete(new OutputHandler(() => {}))
    expect(removedImages).toEqual(["sandy:latest"])
  })

  it("constructs the docker client from the resolved endpoint and exposes its source", async () => {
    const received: unknown[] = []

    const backend = await createBackend({
      readConfig: async () => ({ backend: "docker" }),
      dockerFactory: (options) => {
        received.push(options)
        return makeDockerFake().docker
      },
      resolveEndpoint: () => ({
        options: { socketPath: "/resolved/docker.sock" },
        source: "context 'test' → unix:///resolved/docker.sock",
      }),
    })

    expect(received).toEqual([{ socketPath: "/resolved/docker.sock" }])
    expect(backend.describe?.()).toBe("context 'test' → unix:///resolved/docker.sock")
  })

  it("defers endpoint resolution failures to backend use instead of throwing at construction", async () => {
    const backend = await createBackend({
      readConfig: async () => ({ backend: "docker" }),
      dockerFactory: () => {
        throw new Error("must not construct a client")
      },
      resolveEndpoint: () => {
        throw new Error("context 'broken' has no usable endpoint")
      },
    })

    const handler = new OutputHandler(() => {})
    await expect(backend.imageExists(handler)).rejects.toThrow(/context 'broken'/)
    await expect(backend.run(baseRunOpts, handler)).rejects.toThrow(/context 'broken'/)
    expect(backend.describe?.()).toBeUndefined()
  })

  it("does not resolve a docker endpoint for the shuru backend", async () => {
    const backend = await createBackend({
      readConfig: async () => ({ backend: "shuru" }),
      resolveEndpoint: () => {
        throw new Error("must not be called")
      },
    })

    expect(backend.constructor.name).toBe("ShuruBackend")
  })
})
