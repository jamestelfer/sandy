import { describe, expect, test } from "bun:test"
import Docker from "dockerode"
import { OutputHandler } from "../output"
import { DockerBackend } from "./docker-backend"
import { resolveDockerOptions } from "./docker-endpoint"

const SKIP = process.env.INTEGRATION !== "true"
const noop = new OutputHandler(() => {})

describe("docker endpoint resolution integration", () => {
  test.skipIf(SKIP)(
    "the application endpoint resolver reaches the real daemon",
    async () => {
      const { options, source } = resolveDockerOptions()
      const docker = new Docker(options)
      await docker.ping()

      const backend = new DockerBackend(docker, { source })
      expect(backend.describe()).toBe(source)
      expect(typeof (await backend.imageExists(noop))).toBe("boolean")
    },
    30_000,
  )
})
