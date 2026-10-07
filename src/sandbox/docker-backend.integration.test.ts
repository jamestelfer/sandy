import { describe, expect, test } from "bun:test"
import Docker from "dockerode"
import { OutputHandler } from "../output"
import { establishWorkDir, Session } from "../session"
import { useTestCwdIsolation } from "../test-support"
import { DockerBackend } from "."
import { resolveDockerOptions } from "./docker-endpoint"

useTestCwdIsolation()

const noop = new OutputHandler(() => {})

const SKIP = !process.env.INTEGRATION
const SKIP_SLOW = SKIP || !process.env.SLOW_TEST
const TIMEOUT = 300_000

function createDockerBackend() {
  const { options, source } = resolveDockerOptions()
  const docker = new Docker(options)
  return { docker, backend: new DockerBackend(docker, { source }) }
}

describe("DockerBackend integration", () => {
  test.skipIf(SKIP)(
    "imageCreate builds sandy:latest image and tags sandy:layer-retention",
    async () => {
      const { docker, backend } = createDockerBackend()
      await backend.imageCreate(noop)
      expect(await backend.imageExists(noop)).toBe(true)
      await expect(docker.getImage("sandy:layer-retention").inspect()).resolves.toBeDefined()
    },
    TIMEOUT,
  )

  test.skipIf(SKIP)(
    "run executes script and returns stdout",
    async () => {
      const { backend } = createDockerBackend()
      if (!(await backend.imageExists(noop))) {
        await backend.imageCreate(noop)
      }

      await establishWorkDir()
      await using session = await Session.ephemeral()
      const scriptPath = await session.writeScript(
        "hello.ts",
        'console.log("[-->  hello from docker")\n',
      )

      const result = await backend.run(
        {
          scriptPath,
          imdsPort: 9001,
          session: session.name,
          sessionDir: session.dir,
        },
        noop,
      )
      expect(result.exitCode).toBe(0)
    },
    TIMEOUT,
  )

  // Image-deletion tests run last so they don't force earlier tests to rebuild
  test.skipIf(SKIP)(
    "imageDelete removes sandy:latest but retains sandy:layer-retention",
    async () => {
      const { docker, backend } = createDockerBackend()
      // Prune stopped containers so none hold a reference to the image
      try {
        await docker.pruneContainers()
      } catch {
        /* ignore */
      }
      if (!(await backend.imageExists(noop))) {
        await backend.imageCreate(noop)
      }
      await backend.imageDelete(noop)
      expect(await backend.imageExists(noop)).toBe(false)
      // layer-retention tag persists — keeps build cache warm for next imageCreate
      await expect(docker.getImage("sandy:layer-retention").inspect()).resolves.toBeDefined()
    },
    TIMEOUT,
  )

  // Force-delete removes both tags — run after soft-delete test to rebuild first
  test.skipIf(SKIP_SLOW)(
    "imageDelete with force removes sandy:latest and sandy:layer-retention",
    async () => {
      const { docker, backend } = createDockerBackend()
      try {
        await docker.pruneContainers()
      } catch {
        /* ignore */
      }
      if (!(await backend.imageExists(noop))) {
        await backend.imageCreate(noop)
      }
      await backend.imageDelete(noop, true)
      expect(await backend.imageExists(noop)).toBe(false)
      await expect(docker.getImage("sandy:layer-retention").inspect()).rejects.toThrow()
    },
    TIMEOUT,
  )

  test.skipIf(SKIP)(
    "imageExists returns false when image is absent",
    async () => {
      const { docker, backend } = createDockerBackend()
      // Prune stopped containers then remove the primary image tag.
      // Keep sandy:layer-retention to preserve cache warmth.
      try {
        await docker.pruneContainers()
      } catch {
        /* ignore */
      }
      try {
        await docker.getImage("sandy:latest").remove()
      } catch {
        /* already absent */
      }
      expect(await backend.imageExists(noop)).toBe(false)
    },
    TIMEOUT,
  )
})
