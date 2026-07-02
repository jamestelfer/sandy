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

function isAbsent(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}

function readCurrentContext(configDir: string): string | undefined {
  const configPath = path.join(configDir, "config.json")
  let raw: string
  try {
    raw = readFileSync(configPath, "utf-8")
  } catch (error) {
    if (isAbsent(error)) {
      return undefined
    }
    throw new Error(`Cannot read Docker config at ${configPath}: ${(error as Error).message}`)
  }
  try {
    return (JSON.parse(raw) as { currentContext?: string }).currentContext
  } catch {
    throw new Error(
      `Docker config at ${configPath} is not valid JSON. ` +
        `Fix it, or set DOCKER_HOST to bypass context resolution.`,
    )
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
    const filePath = path.join(tlsDir, file)
    try {
      return readFileSync(filePath, "utf-8")
    } catch (error) {
      if (isAbsent(error)) {
        return undefined
      }
      throw new Error(
        `Cannot read Docker context TLS file ${filePath}: ${(error as Error).message}`,
      )
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
  if (!found || !host) {
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
    const skipVerify = found.meta.Endpoints?.docker?.SkipTLSVerify === true
    const { ca, cert, key } = readTlsMaterial(configDir, found.storeDir)
    const useTls = skipVerify || Boolean(ca || cert || key)
    // WHATWG URL keeps IPv6 brackets in hostname; node's http host option must not.
    const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1")
    // Docker's conventions for portless tcp endpoints: 2376 with TLS, 2375 without.
    const port = url.port ? Number(url.port) : useTls ? 2376 : 2375
    // No TLS data and no skip flag: docker treats such endpoints as plain HTTP.
    // With SkipTLSVerify, client certs are still presented (matching docker CLI);
    // docker-modem forwards a custom agent to the https request, its only knob
    // for accepting a daemon certificate without verification.
    const tls = skipVerify
      ? { protocol: "https" as const, cert, key, agent: new Agent({ rejectUnauthorized: false }) }
      : useTls
        ? { protocol: "https" as const, ca, cert, key }
        : { protocol: "http" as const }
    return {
      options: { host: hostname, port, ...tls } as DockerOptions,
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
