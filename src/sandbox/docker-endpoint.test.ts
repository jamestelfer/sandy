import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { resolveDockerOptions } from "./docker-endpoint"

let homeDir: string

beforeEach(async () => {
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandy-docker-endpoint-"))
})

afterEach(async () => {
  await fs.rm(homeDir, { recursive: true, force: true })
})

async function writeContext(
  configDir: string,
  name: string,
  endpoint: { Host: string; SkipTLSVerify?: boolean },
): Promise<void> {
  const metaDir = path.join(configDir, "contexts", "meta", `${name}-hash`)
  await fs.mkdir(metaDir, { recursive: true })
  await fs.writeFile(
    path.join(metaDir, "meta.json"),
    JSON.stringify({ Name: name, Endpoints: { docker: endpoint } }),
  )
}

describe("resolveDockerOptions", () => {
  it("defers to dockerode env resolution when DOCKER_HOST is set, ignoring contexts", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "orbstack", { Host: "unix:///some/context.sock" })

    const { options, source } = resolveDockerOptions({
      env: { DOCKER_HOST: "tcp://example.com:2376", DOCKER_CONTEXT: "orbstack" },
      homeDir,
    })

    expect(options).toBeUndefined()
    expect(source).toContain("DOCKER_HOST=tcp://example.com:2376")
  })

  it("resolves the context named by currentContext in config.json", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "rancher-desktop", {
      Host: "unix:///Users/x/.rd/docker.sock",
    })
    await fs.writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify({ currentContext: "rancher-desktop" }),
    )

    const { options } = resolveDockerOptions({ env: {}, homeDir })

    expect(options).toEqual({ socketPath: "/Users/x/.rd/docker.sock" })
  })

  it("honours DOCKER_CONFIG as the config directory", async () => {
    const configDir = path.join(homeDir, "custom-docker-config")
    await writeContext(configDir, "colima", { Host: "unix:///Users/x/.colima/docker.sock" })
    await fs.writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify({ currentContext: "colima" }),
    )

    const { options } = resolveDockerOptions({
      env: { DOCKER_CONFIG: configDir },
      homeDir,
    })

    expect(options).toEqual({ socketPath: "/Users/x/.colima/docker.sock" })
  })

  it("throws an actionable error when the selected context does not exist", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "orbstack", { Host: "unix:///some.sock" })

    expect(() =>
      resolveDockerOptions({ env: { DOCKER_CONTEXT: "does-not-exist" }, homeDir }),
    ).toThrow(/does-not-exist/)
  })

  it("throws when the selected context exists but its meta.json is unparseable", async () => {
    const configDir = path.join(homeDir, ".docker")
    const metaDir = path.join(configDir, "contexts", "meta", "garbled-hash")
    await fs.mkdir(metaDir, { recursive: true })
    await fs.writeFile(path.join(metaDir, "meta.json"), "{not json")

    expect(() => resolveDockerOptions({ env: { DOCKER_CONTEXT: "garbled" }, homeDir })).toThrow(
      /garbled/,
    )
  })

  it("resolves a tcp context with TLS material to host, port, protocol and certs", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "remote-tls", { Host: "tcp://daemon.example.com:2376" })
    const tlsDir = path.join(configDir, "contexts", "tls", "remote-tls-hash", "docker")
    await fs.mkdir(tlsDir, { recursive: true })
    await fs.writeFile(path.join(tlsDir, "ca.pem"), "CA-PEM")
    await fs.writeFile(path.join(tlsDir, "cert.pem"), "CERT-PEM")
    await fs.writeFile(path.join(tlsDir, "key.pem"), "KEY-PEM")

    const { options, source } = resolveDockerOptions({
      env: { DOCKER_CONTEXT: "remote-tls" },
      homeDir,
    })

    expect(options).toEqual({
      host: "daemon.example.com",
      port: 2376,
      protocol: "https",
      ca: "CA-PEM",
      cert: "CERT-PEM",
      key: "KEY-PEM",
    })
    expect(source).toContain("tcp://daemon.example.com:2376")
  })

  it("disables certificate verification for tcp contexts with SkipTLSVerify, without requiring certs", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "self-signed", {
      Host: "tcp://daemon.example.com:2376",
      SkipTLSVerify: true,
    })

    const { options } = resolveDockerOptions({ env: { DOCKER_CONTEXT: "self-signed" }, homeDir })

    expect(options?.host).toBe("daemon.example.com")
    expect(options?.port).toBe(2376)
    expect(options?.protocol).toBe("https")
    expect(options?.ca).toBeUndefined()
    const agent = (options as { agent?: { options?: { rejectUnauthorized?: boolean } } })?.agent
    expect(agent?.options?.rejectUnauthorized).toBe(false)
  })

  it("resolves a tcp context without TLS material to a plain http endpoint", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "plain-tcp", { Host: "tcp://10.0.0.5:2375" })

    const { options } = resolveDockerOptions({ env: { DOCKER_CONTEXT: "plain-tcp" }, homeDir })

    expect(options).toEqual({ host: "10.0.0.5", port: 2375, protocol: "http" })
  })

  it("throws an actionable error naming DOCKER_HOST for ssh context endpoints", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "remote", { Host: "ssh://user@example.com" })

    expect(() => resolveDockerOptions({ env: { DOCKER_CONTEXT: "remote" }, homeDir })).toThrow(
      /DOCKER_HOST/,
    )
  })

  it("defers to dockerode default socket probing when nothing is selected", () => {
    const { options, source } = resolveDockerOptions({ env: {}, homeDir })

    expect(options).toBeUndefined()
    expect(source).toContain("default")
  })

  it("defers to dockerode default socket probing when currentContext is 'default'", async () => {
    const configDir = path.join(homeDir, ".docker")
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify({ currentContext: "default" }),
    )

    const { options } = resolveDockerOptions({ env: {}, homeDir })

    expect(options).toBeUndefined()
  })

  it("resolves a DOCKER_CONTEXT-selected unix context to its socketPath", async () => {
    const configDir = path.join(homeDir, ".docker")
    await writeContext(configDir, "orbstack", {
      Host: "unix:///Users/x/.orbstack/run/docker.sock",
    })

    const { options, source } = resolveDockerOptions({
      env: { DOCKER_CONTEXT: "orbstack" },
      homeDir,
    })

    expect(options).toEqual({ socketPath: "/Users/x/.orbstack/run/docker.sock" })
    expect(source).toContain("orbstack")
    expect(source).toContain("/Users/x/.orbstack/run/docker.sock")
  })
})
