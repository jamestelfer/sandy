import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

export interface TmpDir {
  readonly path: string
  [Symbol.asyncDispose](): Promise<void>
}

export async function makeTmpDir(prefix: string, baseDir?: string): Promise<TmpDir> {
  const base = baseDir ?? os.tmpdir()
  if (baseDir) {
    await fs.mkdir(base, { recursive: true })
  }
  const dirPath = await fs.mkdtemp(path.join(base, prefix))
  return {
    path: dirPath,
    [Symbol.asyncDispose]: async () => {
      await fs.rm(dirPath, { recursive: true, force: true })
    },
  }
}
