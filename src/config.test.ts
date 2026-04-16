import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { readConfig, writeConfig } from "./config"

const tmpDir = join(import.meta.dir, "../.tmp-test-config")

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true })
  process.env.XDG_CONFIG_HOME = tmpDir
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.XDG_CONFIG_HOME
})

describe("readConfig", () => {
  it("returns default shuru backend when no config file exists", async () => {
    const config = await readConfig()
    expect(config.backend).toBe("shuru")
  })

  it("returns stored backend when config file exists", async () => {
    const dir = join(tmpDir, "sandy")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "config.json"), JSON.stringify({ backend: "docker" }))
    const config = await readConfig()
    expect(config.backend).toBe("docker")
  })
})

describe("writeConfig", () => {
  it("persists backend and can be read back", async () => {
    await writeConfig({ backend: "docker" })
    const config = await readConfig()
    expect(config.backend).toBe("docker")
  })

  it("overwrites existing config", async () => {
    await writeConfig({ backend: "docker" })
    await writeConfig({ backend: "shuru" })
    const config = await readConfig()
    expect(config.backend).toBe("shuru")
  })
})
