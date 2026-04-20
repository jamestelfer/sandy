import { copyDirectoryRecursive, getEmbeddedFS } from "./embedded-fs"
import { makeTmpDir } from "./tmpdir"
import type { TmpDir } from "./tmpdir"

export async function extractBuiltinChecks(): Promise<TmpDir> {
  const memfs = await getEmbeddedFS()
  const tmp = await makeTmpDir("sandy-check-", process.cwd())
  await copyDirectoryRecursive(memfs, "/checks", tmp.path)
  return tmp
}
