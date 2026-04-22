import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { humanId } from "human-id"

export interface Session {
  name: string
  dir: string
}

// Matches the humanId output format: two or more lowercase words separated by hyphens.
const SESSION_NAME_RE = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/

export function validateSessionName(name: string): void {
  if (!SESSION_NAME_RE.test(name)) {
    throw new Error(`invalid session name: ${JSON.stringify(name)}`)
  }
  // Containment check: ensure the resolved path stays within CWD regardless of
  // what the format check allows. This is the Node.js equivalent of a virtual root.
  const base = process.cwd()
  const resolved = resolve(name)
  if (!resolved.startsWith(base + sep)) {
    throw new Error(`invalid session name: ${JSON.stringify(name)}`)
  }
}

export async function createSession(name?: string, dir?: string): Promise<Session> {
  const sessionName = name ?? humanId({ separator: "-", capitalize: false })
  if (name !== undefined) {
    validateSessionName(sessionName)
  }
  const resolvedDir = dir ? resolve(dir) : resolve(sessionName)

  mkdirSync(resolvedDir, { recursive: true })
  ensureGitignore()

  return { name: sessionName, dir: resolvedDir }
}

function ensureGitignore(): void {
  const path = join(".gitignore")
  if (!existsSync(path)) {
    writeFileSync(path, "*\n")
  }
}
