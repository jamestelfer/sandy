import { readdirSync, readFileSync } from "node:fs"
import { Agent } from "node:https"
import * as os from "node:os"
import * as path from "node:path"
import type { DockerOptions } from "dockerode"

export interface ResolvedDockerEndpoint {
  /** Options for `new Docker(options)`; undefined defers to dockerode's own resolution. */
  options: DockerOptions | undefined
  /** Human-readable description of how the endpoint was resolved. */
  source: string
}

interface ResolveDeps {
  env?: NodeJS.ProcessEnv
  homeDir?: string
}

interface ContextMeta {
  Name?: string
  Endpoints?: { docker?: { Host?: string; SkipTLSVerify?: boolean } }
}

function readCurrentContext(configDir: string): string | undefined {
  try {
    const config = JSON.parse(readFileSync(path.join(configDir, "config.json"), "utf-8")) as {
      currentContext?: string
    }
    return config.currentContext
  } catch {
    return undefined
  }
}

function findContextMeta(
  configDir: string,
  name: string,
): { meta: ContextMeta; storeDir: string } | undefined {
  const metaRoot = path.join(configDir, "contexts", "meta")
  let entries: string[]
  try {
    entries = readdirSync(metaRoot)
  } catch {
    return undefined
  }
  for (const entry of entries) {
    let meta: ContextMeta
    try {
      meta = JSON.parse(readFileSync(path.join(metaRoot, entry, "meta.json"), "utf-8"))
    } catch {
      continue
    }
    if (meta.Name === name) {
      return { meta, storeDir: entry }
    }
  }
  return undefined
}

// TLS material imported into the context store lives alongside the metadata,
// keyed by the same hashed directory name: contexts/tls/<storeDir>/docker/*.pem.
function readTlsMaterial(
  configDir: string,
  storeDir: string,
): { ca?: string; cert?: string; key?: string } {
  const tlsDir = path.join(configDir, "contexts", "tls", storeDir, "docker")
  const read = (file: string): string | undefined => {
    try {
      return readFileSync(path.join(tlsDir, file), "utf-8")
    } catch {
      return undefined
    }
  }
  return { ca: read("ca.pem"), cert: read("cert.pem"), key: read("key.pem") }
}

export function resolveDockerOptions({
  env = process.env,
  homeDir = os.homedir(),
}: ResolveDeps = {}): ResolvedDockerEndpoint {
  if (env.DOCKER_HOST) {
    return { options: undefined, source: `DOCKER_HOST=${env.DOCKER_HOST}` }
  }

  const configDir = env.DOCKER_CONFIG ?? path.join(homeDir, ".docker")
  const contextName = env.DOCKER_CONTEXT ?? readCurrentContext(configDir)
  if (!contextName || contextName === "default") {
    return { options: undefined, source: "default Docker socket (dockerode probing)" }
  }

  const found = findContextMeta(configDir, contextName)
  const host = found?.meta.Endpoints?.docker?.Host
  if (!host) {
    throw new Error(
      `Docker context '${contextName}' has no usable endpoint under ${configDir}/contexts/meta ` +
        `(context missing, unparseable, or lacking a docker endpoint). ` +
        `Run 'docker context ls' to inspect contexts, or set DOCKER_HOST to bypass context resolution.`,
    )
  }
  if (host.startsWith("unix://")) {
    const socketPath = host.slice("unix://".length)
    return {
      options: { socketPath },
      source: `context '${contextName}' → unix://${socketPath}`,
    }
  }
  if (host.startsWith("tcp://") && found) {
    const url = new URL(host)
    const base = { host: url.hostname, port: Number(url.port) }
    const source = `context '${contextName}' → tcp://${url.hostname}:${url.port}`
    if (found.meta.Endpoints?.docker?.SkipTLSVerify) {
      // docker-modem forwards a custom agent to the https request; this is its
      // only knob for accepting a daemon certificate without verification.
      const agent = new Agent({ rejectUnauthorized: false })
      return { options: { ...base, protocol: "https", agent } as DockerOptions, source }
    }
    const { ca, cert, key } = readTlsMaterial(configDir, found.storeDir)
    if (ca || cert || key) {
      return { options: { ...base, protocol: "https", ca, cert, key }, source }
    }
    // No TLS data and no skip flag: docker treats such endpoints as plain HTTP.
    return { options: { ...base, protocol: "http" }, source }
  }
  if (host.startsWith("ssh://")) {
    throw new Error(
      `Docker context '${contextName}' uses an ssh endpoint (${host}), which sandy does not ` +
        `resolve from contexts. Set DOCKER_HOST=${host} to connect via dockerode's ssh support.`,
    )
  }
  throw new Error(
    `Docker context '${contextName}' endpoint '${host}' is not supported. ` +
      `Set DOCKER_HOST to connect to this daemon directly.`,
  )
}
