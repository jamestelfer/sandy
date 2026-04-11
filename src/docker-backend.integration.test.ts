import { describe, expect, test } from "bun:test"
import Docker from "dockerode"
import { DockerBackend } from "./docker-backend"
import { makeTmpDir } from "./tmpdir"

const SKIP = !process.env.INTEGRATION
const TIMEOUT = 300_000

describe("DockerBackend integration", () => {
  test.skipIf(SKIP)(
    "imageCreate builds sandy:latest image",
    async () => {
      const backend = new DockerBackend(new Docker())
      await backend.imageCreate()
      expect(await backend.imageExists()).toBe(true)
    },
    TIMEOUT,
  )

  test.skipIf(SKIP)(
    "run executes script and returns stdout",
    async () => {
      const backend = new DockerBackend(new Docker())
      if (!(await backend.imageExists())) {
        await backend.imageCreate()
      }

      const path = await import("node:path")
      const fs = await import("node:fs/promises")
      await using sessionDir = await makeTmpDir("sandy-integration-")
      await using scriptDir = await makeTmpDir("sandy-scripts-")

      // Write a trivial TypeScript script
      const scriptPath = path.join(scriptDir.path, "hello.ts")
      await fs.writeFile(scriptPath, 'console.log("[-->  hello from docker")\n')

      const result = await backend.run(
        {
          scriptPath,
          imdsPort: 9001,
          session: "integration-test",
          sessionDir: sessionDir.path,
        },
        () => {},
      )
      expect(result.exitCode).toBe(0)
    },
    TIMEOUT,
  )

  // Image-deletion tests run last so they don't force earlier tests to rebuild
  test.skipIf(SKIP)(
    "imageDelete removes sandy:latest image",
    async () => {
      const docker = new Docker()
      const backend = new DockerBackend(docker)
      // Prune stopped containers so none hold a reference to the image
      try {
        await docker.pruneContainers()
      } catch {
        /* ignore */
      }
      if (!(await backend.imageExists())) {
        await backend.imageCreate()
      }
      await backend.imageDelete()
      expect(await backend.imageExists()).toBe(false)
    },
    TIMEOUT,
  )

  test.skipIf(SKIP)(
    "imageExists returns false when image is absent",
    async () => {
      const docker = new Docker()
      const backend = new DockerBackend(docker)
      // Prune stopped containers then remove image
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
      expect(await backend.imageExists()).toBe(false)
    },
    TIMEOUT,
  )
})
