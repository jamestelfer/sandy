import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { humanId } from "human-id"

export interface Session {
  name: string
  dir: string
}

export async function createSession(name?: string): Promise<Session> {
  const sessionName = name ?? humanId({ separator: "-", capitalize: false })
  const dir = join(".sandy", sessionName)

  mkdirSync(dir, { recursive: true })
  ensureGitignore()

  return { name: sessionName, dir }
}

function ensureGitignore(): void {
  const path = join(".sandy", ".gitignore")
  if (!existsSync(path)) {
    mkdirSync(".sandy", { recursive: true })
    writeFileSync(path, "*\n")
  }
}
