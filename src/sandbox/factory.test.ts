import { describe, expect, it } from "bun:test"
import { createBackend } from "./factory"

describe("createBackend", () => {
  it("returns a ShuruBackend when backend is shuru", async () => {
    const backend = await createBackend({
      readConfig: async () => ({ backend: "shuru" }),
    })

    expect(backend.constructor.name).toBe("ShuruBackend")
  })

  it("returns a DockerBackend when backend is docker", async () => {
    const dockerClient = { marker: "docker-client" }

    const backend = await createBackend({
      readConfig: async () => ({ backend: "docker" }),
      dockerFactory: () => dockerClient,
      resolveEndpoint: () => ({ options: undefined, source: "test" }),
    })

    expect(backend.constructor.name).toBe("DockerBackend")
    expect((backend as unknown as { docker: unknown }).docker).toBe(dockerClient)
  })

  it("constructs the docker client from resolved endpoint options", async () => {
    const received: unknown[] = []

    await createBackend({
      readConfig: async () => ({ backend: "docker" }),
      dockerFactory: (options) => {
        received.push(options)
        return { marker: "docker-client" }
      },
      resolveEndpoint: () => ({
        options: { socketPath: "/resolved/docker.sock" },
        source: "context 'test' → unix:///resolved/docker.sock",
      }),
    })

    expect(received).toEqual([{ socketPath: "/resolved/docker.sock" }])
  })

  it("threads the resolved source into the DockerBackend's describe()", async () => {
    const backend = await createBackend({
      readConfig: async () => ({ backend: "docker" }),
      dockerFactory: () => ({ marker: "docker-client" }),
      resolveEndpoint: () => ({
        options: { socketPath: "/resolved/docker.sock" },
        source: "context 'test' → unix:///resolved/docker.sock",
      }),
    })

    expect(backend.describe?.()).toBe("context 'test' → unix:///resolved/docker.sock")
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
