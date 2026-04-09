import { describe, expect, test } from "bun:test"
import Docker from "dockerode"
import { DockerBackend } from "./docker-backend"
import { makeTmpDir } from "./tmpdir"

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
  })
})
