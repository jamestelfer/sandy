import * as path from "node:path"
import { copyDirectoryRecursive, getEmbeddedFS } from "./embedded-fs"
import { makeTmpDir } from "./tmpdir"
import type { TmpDir } from "./tmpdir"

const BUILTIN_CHECKS = new Set(["baseline", "connect"])

// For builtin check names ("baseline", "connect"), extract all embedded check scripts
// into a temp dir. The caller runs `${scriptPath}.ts` within that dir.
// Normal script paths return a no-op disposable pointing to the script's parent dir.
export async function resolveScriptDir(scriptPath: string, tmpBaseDir?: string): Promise<TmpDir> {
  if (BUILTIN_CHECKS.has(scriptPath)) {
    const memfs = await getEmbeddedFS()
    const tmp = await makeTmpDir("sandy-check-", tmpBaseDir)
    await copyDirectoryRecursive(memfs, "/checks", tmp.path)
    return tmp
  }
  return { path: path.dirname(path.resolve(scriptPath)), [Symbol.asyncDispose]: async () => {} }
}
