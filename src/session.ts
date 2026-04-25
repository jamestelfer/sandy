import { existsSync } from "node:fs"
import { lstat, mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { humanId } from "human-id"

// Matches the humanId output format: two or more lowercase words separated by hyphens.
const SESSION_NAME_RE = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/
const SESSION_NAME_FORMAT =
  "expected lowercase hyphen-separated words (for example: quick-brown-fox)"

function isContainedPath(base: string, target: string): boolean {
  return target === base || target.startsWith(base + sep)
}

function assertValidSessionName(name: string, baseDir: string): void {
  if (!SESSION_NAME_RE.test(name)) {
    throw new Error(`invalid session name: ${JSON.stringify(name)}; ${SESSION_NAME_FORMAT}`)
  }
  const resolved = resolve(baseDir, name)
  if (!isContainedPath(baseDir, resolved)) {
    throw new Error(
      `invalid session name: ${JSON.stringify(name)}; resolved path escapes working directory ${JSON.stringify(baseDir)}`,
    )
  }
}

export class Session {
  readonly name: string
  readonly dir: string
  readonly scriptsDir: string
  readonly outputDir: string

  protected constructor(name: string, baseDir: string) {
    const resolvedBase = resolve(baseDir)
    assertValidSessionName(name, resolvedBase)
    this.name = name
    this.dir = resolve(resolvedBase, name)
    this.scriptsDir = join(this.dir, "scripts")
    this.outputDir = join(this.dir, "output")
  }

  static async create(opts: { baseDir?: string } = {}): Promise<Session> {
    const baseDir = opts.baseDir ?? process.cwd()
    const name = humanId({ separator: "-", capitalize: false })
    const session = new Session(name, baseDir)
    await session.mkdirs()
    return session
  }

  static async ephemeral(opts: { baseDir?: string } = {}): Promise<EphemeralSession> {
    const session = await Session.create(opts)
    const disposable = session as EphemeralSession
    disposable[Symbol.asyncDispose] = async () => {
      await session.delete()
    }
    return disposable
  }

  static async resume(name: string, opts: { baseDir?: string } = {}): Promise<Session> {
    const baseDir = opts.baseDir ?? process.cwd()
    const session = new Session(name, baseDir)
    // existsSync is a true synchronous predicate; the async alternative
    // (`fs.access` + catch on rejection) inverts control flow and allocates
    // a rejected promise on the hot miss path. No value add.
    if (!existsSync(session.dir)) {
      throw new Error(
        `session not found: ${JSON.stringify(name)}; use sandy_create_session to create it, or sandy_resume_session to resume it`,
      )
    }
    return session
  }

  async delete(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true })
  }

  async resolveScript(relPath: string): Promise<string> {
    const target = this.resolveInScripts(relPath)
    let stat: Awaited<ReturnType<typeof lstat>>
    try {
      stat = await lstat(target)
    } catch {
      throw new Error(`script not found: expected at ${JSON.stringify(target)}`)
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`script must not be a symlink: ${JSON.stringify(target)}`)
    }
    return target
  }

  async writeScript(relPath: string, content: string | Uint8Array): Promise<string> {
    const target = this.resolveInScripts(relPath)
    try {
      const stat = await lstat(target)
      if (stat.isSymbolicLink()) {
        throw new Error(`script must not be a symlink: ${JSON.stringify(target)}`)
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err
      }
    }
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
    return target
  }

  private resolveInScripts(relPath: string): string {
    const resolved = resolve(this.scriptsDir, relPath)
    if (!isContainedPath(this.scriptsDir, resolved)) {
      throw new Error(
        `script path must be within the session scripts directory: ${JSON.stringify(relPath)} (expected under ${JSON.stringify(this.scriptsDir)})`,
      )
    }
    return resolved
  }

  private async mkdirs(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await mkdir(this.scriptsDir, { recursive: true })
    await mkdir(this.outputDir, { recursive: true })
  }
}

export type EphemeralSession = Session & AsyncDisposable
