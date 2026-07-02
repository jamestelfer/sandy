import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import Docker from "dockerode"
import { OutputHandler } from "../output"
import { DockerBackend } from "./docker-backend"
import { resolveDockerOptions } from "./docker-endpoint"

const SKIP = !process.env.INTEGRATION
const noop = new OutputHandler(() => {})

let configDir: string

beforeEach(async () => {
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandy-docker-config-"))
})

afterEach(async () => {
  await fs.rm(configDir, { recursive: true, force: true })
})

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
      const metaDir = path.join(configDir, "contexts", "meta", "sandy-integration")
      await fs.mkdir(metaDir, { recursive: true })
      await fs.writeFile(
        path.join(metaDir, "meta.json"),
        JSON.stringify({
          Name: "sandy-it",
          Endpoints: { docker: { Host: `unix://${realDockerSocket()}` } },
        }),
      )
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify({ currentContext: "sandy-it" }),
      )

      const { options, source } = resolveDockerOptions({
        env: { DOCKER_CONFIG: configDir },
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
