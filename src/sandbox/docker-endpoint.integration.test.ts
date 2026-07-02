import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import Docker from "dockerode"
import { OutputHandler } from "../output"
import { makeTmpDir } from "../resources"
import { writeDockerContext } from "../test-support"
import { DockerBackend } from "./docker-backend"
import { resolveDockerOptions } from "./docker-endpoint"

const SKIP = process.env.INTEGRATION !== "true"
const noop = new OutputHandler(() => {})

// The same probing order dockerode uses for its default socket.
function realDockerSocket(): string {
  const candidates = [
    path.join(os.homedir(), ".docker", "run", "docker.sock"),
    "/var/run/docker.sock",
  ]
  const found = candidates.find(existsSync)
  if (!found) {
    throw new Error(`no local docker socket found in: ${candidates.join(", ")}`)
  }
  return found
}

describe("docker endpoint resolution integration", () => {
  test.skipIf(SKIP)(
    "a context resolved from DOCKER_CONFIG reaches the real daemon",
    async () => {
      await using configTmp = await makeTmpDir("sandy-docker-config-")
      await writeDockerContext(
        configTmp.path,
        "sandy-it",
        { Host: `unix://${realDockerSocket()}` },
        { current: true },
      )

      const { options, source } = resolveDockerOptions({
        env: { DOCKER_CONFIG: configTmp.path },
        homeDir: "/nonexistent-home",
      })

      expect(source).toContain("sandy-it")

      const docker = new Docker(options)
      await docker.ping()

      const backend = new DockerBackend(docker)
      expect(typeof (await backend.imageExists(noop))).toBe("boolean")
    },
    30_000,
  )
})
