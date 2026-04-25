import { createHash } from "node:crypto"
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

function tryUseDir(dirPath: string): boolean {
  const probePath = path.join(dirPath, ".write-probe")
  try {
    mkdirSync(dirPath, { recursive: true })
    writeFileSync(probePath, "")
    unlinkSync(probePath)
    process.chdir(dirPath)
    return true
  } catch {
    return false
  }
}

function ensureGitignore(): void {
  const gitignorePath = "./.gitignore"
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "*\n")
  }
}

export async function establishWorkDir(): Promise<void> {
  const origin = process.cwd()
  const local = path.resolve(origin, ".sandy")
  if (tryUseDir(local)) {
    ensureGitignore()
    return
  }

  const hash = createHash("sha256").update(origin).digest("base64url").slice(0, 16)
  const fallback = path.join(os.tmpdir(), "sandy", hash)
  if (tryUseDir(fallback)) {
    ensureGitignore()
    return
  }

  throw new Error(
    `unable to establish sandy working directory: ${JSON.stringify(local)} or ${JSON.stringify(fallback)}`,
  )
}
