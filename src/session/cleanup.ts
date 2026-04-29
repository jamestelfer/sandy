import { lstat, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { SESSION_NAME_RE } from "./session"

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

async function hasFiles(dir: string, depth = 4): Promise<boolean> {
  if (depth === 0) {
    return false
  }
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (entry.isFile()) {
      return true
    }
    if (entry.isDirectory() && (await hasFiles(join(dir, entry.name), depth - 1))) {
      return true
    }
  }
  return false
}

export async function cleanupStaleSessions(baseDir: string): Promise<number> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(baseDir, { withFileTypes: true })
  } catch {
    return 0
  }

  const now = Date.now()
  let count = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    if (!SESSION_NAME_RE.test(entry.name)) {
      continue
    }

    const entryPath = join(baseDir, entry.name)
    try {
      const stat = await lstat(entryPath)
      if (now - stat.mtimeMs < FORTY_EIGHT_HOURS_MS) {
        continue
      }
      if (await hasFiles(entryPath)) {
        continue
      }
      await rm(entryPath, { recursive: true, force: true })
      count++
    } catch {
      // swallow per-entry errors so cleanup never breaks a command
    }
  }

  return count
}
