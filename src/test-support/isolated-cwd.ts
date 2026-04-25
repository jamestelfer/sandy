import { afterEach, beforeEach } from "bun:test"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import type { TmpDir } from "../resources/tmpdir"
import { makeTmpDir } from "../resources/tmpdir"

interface IsolatedCwdContext {
  repoRoot: string
  testTmpRoot: string
  currentDir: () => string
}

export function useTestCwdIsolation(): IsolatedCwdContext {
  const repoRoot = join(import.meta.dir, "../..")
  const testTmpRoot = join(repoRoot, ".sandy", ".test-tmp")
  let dir: TmpDir | null = null

  beforeEach(async () => {
    mkdirSync(testTmpRoot, { recursive: true })
    dir = await makeTmpDir("test-", testTmpRoot)
    process.chdir(dir.path)
  })

  afterEach(async () => {
    process.chdir(repoRoot)
    if (dir) {
      await dir[Symbol.asyncDispose]()
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
      return dir.path
    },
  }
}
