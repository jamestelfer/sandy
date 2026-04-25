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
    })

    expect(backend.constructor.name).toBe("DockerBackend")
    expect((backend as unknown as { docker: unknown }).docker).toBe(dockerClient)
  })
})
