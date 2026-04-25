import Docker from "dockerode"
import { type Config, readConfig } from "../core/config"
import type { Backend } from "./backend"
import { DockerBackend, type DockerClientLike } from "./docker-backend"
import { ShuruBackend } from "./shuru-backend"

interface CreateBackendDeps {
  readConfig?: () => Promise<Config>
  dockerFactory?: () => DockerClientLike
}

export async function createBackend(deps: CreateBackendDeps = {}): Promise<Backend> {
  const getConfig = deps.readConfig ?? readConfig
  const makeDocker = deps.dockerFactory ?? (() => new Docker())

  const config = await getConfig()
  switch (config.backend) {
    case "shuru":
      return new ShuruBackend()
    case "docker":
      return new DockerBackend(makeDocker())
  }
}
