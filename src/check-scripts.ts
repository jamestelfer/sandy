import * as path from "node:path"
import * as fs from "node:fs/promises"
import { getEmbeddedFS } from "./embedded-fs"
import { makeTmpDir } from "./tmpdir"
import type { TmpDir } from "./tmpdir"

const CHECK_SCRIPTS: Record<string, string> = {
  __baseline__: "baseline.ts",
  __connect__: "connect.ts",
}

// For __baseline__ and __connect__, create a temp dir with the appropriate check script.
// Normal script paths return a no-op disposable pointing to the script's parent dir.
export async function resolveScriptDir(scriptPath: string, tmpBaseDir?: string): Promise<TmpDir> {
  const embeddedFile = CHECK_SCRIPTS[scriptPath]
  if (embeddedFile !== undefined) {
    const memfs = await getEmbeddedFS()
    const tmp = await makeTmpDir("sandy-check-", tmpBaseDir)
    const content = memfs.readFileSync(`/checks/${embeddedFile}`, "utf-8") as string
    await fs.writeFile(`${tmp.path}/${scriptPath}.ts`, content)
    return tmp
  }
  return { path: path.dirname(path.resolve(scriptPath)), [Symbol.asyncDispose]: async () => {} }
}
