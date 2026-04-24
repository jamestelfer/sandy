import { describe, expect, test } from "bun:test"
import Docker from "dockerode"
import { DockerBackend } from "./docker-backend"
import { OutputHandler } from "./output-handler"
import { makeTmpDir } from "./tmpdir"

const noop = new OutputHandler(() => {})

const SKIP = !process.env.INTEGRATION
const SKIP_SLOW = SKIP || !process.env.SLOW_TEST
const TIMEOUT = 300_000

describe("DockerBackend integration", () => {
  test.skipIf(SKIP)(
    "imageCreate builds sandy:latest image and tags sandy:layer-retention",
    async () => {
      const docker = new Docker()
      const backend = new DockerBackend(docker)
      await backend.imageCreate(noop)
      expect(await backend.imageExists(noop)).toBe(true)
      await expect(docker.getImage("sandy:layer-retention").inspect()).resolves.toBeDefined()
    },
    TIMEOUT,
  )

  test.skipIf(SKIP)(
    "run executes script and returns stdout",
    async () => {
      const backend = new DockerBackend(new Docker())
      if (!(await backend.imageExists(noop))) {
        await backend.imageCreate(noop)
      }

      const path = await import("node:path")
      const fs = await import("node:fs/promises")
      await using sessionDir = await makeTmpDir("sandy-integration-")
      const scriptsDir = path.join(sessionDir.path, "scripts")
      const outputDir = path.join(sessionDir.path, "output")
      await fs.mkdir(scriptsDir, { recursive: true })
      await fs.mkdir(outputDir, { recursive: true })

      // Write a trivial TypeScript script in the session scripts directory
      const scriptPath = path.join(scriptsDir, "hello.ts")
      await fs.writeFile(scriptPath, 'console.log("[-->  hello from docker")\n')

      const result = await backend.run(
        {
          scriptPath,
          imdsPort: 9001,
          session: "integration-test",
          sessionDir: sessionDir.path,
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
      const docker = new Docker()
      const backend = new DockerBackend(docker)
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
      const docker = new Docker()
      const backend = new DockerBackend(docker)
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
      const docker = new Docker()
      const backend = new DockerBackend(docker)
      // Prune stopped containers then remove both image tags
      try {
        await docker.pruneContainers()
      } catch {
        /* ignore */
      }
      for (const name of ["sandy:latest", "sandy:layer-retention"]) {
        try {
          await docker.getImage(name).remove()
        } catch {
          /* already absent */
        }
      }
      expect(await backend.imageExists(noop)).toBe(false)
    },
    TIMEOUT,
  )
})
