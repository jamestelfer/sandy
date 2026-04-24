import { afterEach, beforeEach } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { humanId } from "human-id"

interface IsolatedCwd {
  repoRoot: string
  testTmpRoot: string
  currentDir: () => string
}

export function useIsolatedCwd(): IsolatedCwd {
  const repoRoot = join(import.meta.dir, "..")
  const testTmpRoot = join(repoRoot, ".sandy", ".test-tmp")
  let dir: string | null = null

  beforeEach(() => {
    dir = join(testTmpRoot, humanId({ separator: "-", capitalize: false }))
    mkdirSync(dir, { recursive: true })
    process.chdir(dir)
  })

  afterEach(() => {
    process.chdir(repoRoot)
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
      dir = null
    }
  })

  return {
    repoRoot,
    testTmpRoot,
    currentDir: () => {
      if (!dir) {
        throw new Error("isolated cwd is not active")
      }
      return dir
    },
  }
}
