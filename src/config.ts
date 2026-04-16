import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

export type BackendType = "shuru" | "docker"

export interface Config {
  backend: BackendType
}

const DEFAULT_CONFIG: Config = { backend: "shuru" }

function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(xdg, "sandy", "config.json")
}

export async function readConfig(): Promise<Config> {
  const path = configPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = readFileSync(path, "utf8")
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function writeConfig(config: Config): Promise<void> {
  const path = configPath()
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
}
