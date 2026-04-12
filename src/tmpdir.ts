import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

export interface TmpDir {
  readonly path: string
  [Symbol.asyncDispose](): Promise<void>
}

export async function makeTmpDir(prefix: string): Promise<TmpDir> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  return {
    path: dirPath,
    [Symbol.asyncDispose]: async () => {
      await fs.rm(dirPath, { recursive: true, force: true })
    },
  }
}
