import Docker, { type DockerOptions } from "dockerode"
import { type Config, readConfig } from "../core"
import type { Backend } from "./backend"
import { DockerBackend, type DockerClientLike } from "./docker-backend"
import { type ResolvedDockerEndpoint, resolveDockerOptions } from "./docker-endpoint"
import { ShuruBackend } from "./shuru-backend"

interface CreateBackendDeps {
  readConfig?: () => Promise<Config>
  dockerFactory?: (options?: DockerOptions) => DockerClientLike
  resolveEndpoint?: () => ResolvedDockerEndpoint
}

// Endpoint-resolution failures surface when a Docker operation runs, not at
// construction: commands that never touch Docker (config, help, MCP server
// startup) keep working, and each MCP tool call reports the actionable error.
function unavailableBackend(error: unknown): Backend {
  const rethrow = () => Promise.reject(error)
  return { imageCreate: rethrow, imageDelete: rethrow, imageExists: rethrow, run: rethrow }
}

export async function createBackend(deps: CreateBackendDeps = {}): Promise<Backend> {
  const getConfig = deps.readConfig ?? readConfig
  const makeDocker = deps.dockerFactory ?? ((options?: DockerOptions) => new Docker(options))
  const resolveEndpoint = deps.resolveEndpoint ?? resolveDockerOptions

  const config = await getConfig()
  switch (config.backend) {
    case "shuru":
      return new ShuruBackend()
    case "docker": {
      let resolved: ResolvedDockerEndpoint
      try {
        resolved = resolveEndpoint()
      } catch (error) {
        return unavailableBackend(error)
      }
      return new DockerBackend(makeDocker(resolved.options), { source: resolved.source })
    }
  }
}
