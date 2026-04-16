import * as path from "node:path"
import * as fs from "node:fs/promises"
import { readFileSync } from "node:fs"
import { makeTmpDir } from "./tmpdir"
import type { TmpDir } from "./tmpdir"

// Check scripts — embedded in binary by Bun at build time
import baselineScriptPath from "./checks/baseline.ts" with { type: "file" }
import connectScriptPath from "./checks/connect.ts" with { type: "file" }

const CHECK_SCRIPTS: Record<string, string> = {
  __baseline__: readFileSync(baselineScriptPath, "utf-8"),
  __connect__: readFileSync(connectScriptPath, "utf-8"),
}

// For __baseline__ and __connect__, create a temp dir with the appropriate check script.
// Normal script paths return a no-op disposable pointing to the script's parent dir.
export async function resolveScriptDir(scriptPath: string, tmpBaseDir?: string): Promise<TmpDir> {
  const script = CHECK_SCRIPTS[scriptPath]
  if (script !== undefined) {
    const tmp = await makeTmpDir("sandy-check-", tmpBaseDir)
    await fs.writeFile(`${tmp.path}/${scriptPath}.ts`, script)
    return tmp
  }
  return { path: path.dirname(path.resolve(scriptPath)), [Symbol.asyncDispose]: async () => {} }
}
