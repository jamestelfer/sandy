import { describe, expect, test } from "bun:test"
import Docker from "dockerode"
import { DockerBackend } from "./docker-backend"

const SKIP = !process.env.INTEGRATION

describe("DockerBackend integration", () => {
  test.skipIf(SKIP)("imageCreate builds sandy:latest image", async () => {
    const backend = new DockerBackend(new Docker())
    await backend.imageCreate()
    expect(await backend.imageExists()).toBe(true)
  })

  test.skipIf(SKIP)("imageDelete removes sandy:latest image", async () => {
    const backend = new DockerBackend(new Docker())
    // Ensure image exists first
    if (!(await backend.imageExists())) {
      await backend.imageCreate()
    }
    await backend.imageDelete()
    expect(await backend.imageExists()).toBe(false)
  })

  test.skipIf(SKIP)("imageExists returns false when image is absent", async () => {
    const docker = new Docker()
    const backend = new DockerBackend(docker)
    // Remove if present
    try {
      await docker.getImage("sandy:latest").remove()
    } catch {
      // already absent
    }
    expect(await backend.imageExists()).toBe(false)
  })

  test.skipIf(SKIP)("run executes script and returns stdout", async () => {
    const backend = new DockerBackend(new Docker())
    if (!(await backend.imageExists())) {
      await backend.imageCreate()
    }

    const os = await import("node:os")
    const path = await import("node:path")
    const fs = await import("node:fs/promises")
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandy-integration-"))
    const scriptDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandy-scripts-"))

    // Write a trivial TypeScript script
    const scriptPath = path.join(scriptDir, "hello.ts")
    await fs.writeFile(scriptPath, 'console.log("[-->  hello from docker")\n')

    try {
      const result = await backend.run(
        {
          scriptPath,
          imdsPort: 9001,
          session: "integration-test",
          sessionDir: tmpDir,
        },
        () => {},
      )
      expect(result.exitCode).toBe(0)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
      await fs.rm(scriptDir, { recursive: true, force: true })
    }
  })
})
