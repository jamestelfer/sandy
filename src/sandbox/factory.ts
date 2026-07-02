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

export async function createBackend(deps: CreateBackendDeps = {}): Promise<Backend> {
  const getConfig = deps.readConfig ?? readConfig
  const makeDocker = deps.dockerFactory ?? ((options?: DockerOptions) => new Docker(options))
  const resolveEndpoint = deps.resolveEndpoint ?? resolveDockerOptions

  const config = await getConfig()
  switch (config.backend) {
    case "shuru":
      return new ShuruBackend()
    case "docker": {
      const { options } = resolveEndpoint()
      return new DockerBackend(makeDocker(options))
    }
  }
}
