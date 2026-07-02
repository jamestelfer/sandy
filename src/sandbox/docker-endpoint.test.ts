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
