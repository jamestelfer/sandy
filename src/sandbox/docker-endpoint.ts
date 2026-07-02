import { Agent } from "node:https"
import * as os from "node:os"
import * as path from "node:path"
import type { DockerOptions } from "dockerode"
import { listDirIfPresent, readFileIfPresent } from "../core"

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

// docker-modem accepts an `agent` option at runtime; @types/dockerode omits it.
interface DockerAgentOptions extends DockerOptions {
  agent?: Agent
}

/** The docker endpoint of a named context, extracted from its meta.json. */
interface ContextEndpoint {
  host?: string
  skipTlsVerify: boolean
  storeDir: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

// JSON cannot encode undefined, so undefined unambiguously means "unparseable".
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function readCurrentContext(configDir: string): string | undefined {
  const configPath = path.join(configDir, "config.json")
  const raw = readFileIfPresent(configPath, "Docker config")
  if (raw === undefined) {
    return undefined
  }
  const config = parseJson(raw)
  if (config === undefined) {
    throw new Error(
      `Docker config at ${configPath} is not valid JSON. ` +
        `Fix it, or set DOCKER_HOST to bypass context resolution.`,
    )
  }
  const current = isRecord(config) ? config.currentContext : undefined
  return typeof current === "string" ? current : undefined
}

function findContextEndpoint(configDir: string, name: string): ContextEndpoint | undefined {
  const metaRoot = path.join(configDir, "contexts", "meta")
  for (const storeDir of listDirIfPresent(metaRoot, "Docker contexts")) {
    const metaPath = path.join(metaRoot, storeDir, "meta.json")
    const raw = readFileIfPresent(metaPath, "Docker context metadata")
    // Unparseable meta.json is treated as not-found; the caller's error covers it.
    const meta = raw === undefined ? undefined : parseJson(raw)
    if (!isRecord(meta) || meta.Name !== name) {
      continue
    }
    const docker =
      isRecord(meta.Endpoints) && isRecord(meta.Endpoints.docker)
        ? meta.Endpoints.docker
        : undefined
    return {
      host: typeof docker?.Host === "string" ? docker.Host : undefined,
      skipTlsVerify: docker?.SkipTLSVerify === true,
      storeDir,
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
  const read = (file: string): string | undefined =>
    readFileIfPresent(path.join(tlsDir, file), "Docker context TLS file")
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

  const endpoint = findContextEndpoint(configDir, contextName)
  const host = endpoint?.host
  if (!endpoint || !host) {
    throw new Error(
      `Docker context '${contextName}' has no usable endpoint under ${configDir}/contexts/meta ` +
        `(context missing, unparseable, or lacking a docker endpoint). ` +
        `Run 'docker context ls' to inspect contexts, or set DOCKER_HOST to bypass context resolution.`,
    )
  }
  if (host.startsWith("unix://")) {
    return {
      options: { socketPath: host.slice("unix://".length) },
      source: `context '${contextName}' → ${host}`,
    }
  }
  if (host.startsWith("npipe://")) {
    return {
      options: { socketPath: host.slice("npipe://".length) },
      source: `context '${contextName}' → ${host}`,
    }
  }
  if (host.startsWith("tcp://")) {
    let url: URL
    try {
      url = new URL(host)
    } catch {
      throw new Error(
        `Docker context '${contextName}' has a malformed tcp endpoint '${host}'. ` +
          `Fix the context, or set DOCKER_HOST to bypass context resolution.`,
      )
    }
    const { ca, cert, key } = readTlsMaterial(configDir, endpoint.storeDir)
    const useTls = endpoint.skipTlsVerify || Boolean(ca || cert || key)
    // WHATWG URL keeps IPv6 brackets in hostname; node's http host option must not.
    const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1")
    // Docker's conventions for portless tcp endpoints: 2376 with TLS, 2375 without.
    const port = url.port ? Number(url.port) : useTls ? 2376 : 2375
    // No TLS data and no skip flag: docker treats such endpoints as plain HTTP.
    // With SkipTLSVerify, client certs are still presented (matching docker CLI);
    // docker-modem forwards a custom agent to the https request, its only knob
    // for accepting a daemon certificate without verification.
    const tls: DockerAgentOptions = endpoint.skipTlsVerify
      ? { protocol: "https", cert, key, agent: new Agent({ rejectUnauthorized: false }) }
      : useTls
        ? { protocol: "https", ca, cert, key }
        : { protocol: "http" }
    return {
      options: { host: hostname, port, ...tls },
      source: `context '${contextName}' → tcp://${url.hostname}:${port}`,
    }
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
