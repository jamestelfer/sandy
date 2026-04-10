import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { humanId } from "human-id"

export interface Session {
  name: string
  dir: string
}

export async function createSession(name?: string, dir?: string): Promise<Session> {
  const sessionName = name ?? humanId({ separator: "-", capitalize: false })
  const resolvedDir = dir ? resolve(dir) : resolve(join(".sandy", sessionName))

  mkdirSync(resolvedDir, { recursive: true })
  ensureGitignore()

  return { name: sessionName, dir: resolvedDir }
}

function ensureGitignore(): void {
  const path = join(".sandy", ".gitignore")
  if (!existsSync(path)) {
    mkdirSync(".sandy", { recursive: true })
    writeFileSync(path, "*\n")
  }
}
