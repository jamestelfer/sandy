import * as path from "node:path"
import * as fs from "node:fs/promises"
import { makeTmpDir } from "./tmpdir"
import type { TmpDir } from "./tmpdir"

// For __baseline__ and __connect__, create a temp dir with the appropriate check script.
// Normal script paths return a no-op disposable pointing to the script's parent dir.
export async function resolveScriptDir(scriptPath: string): Promise<TmpDir> {
  if (scriptPath === "__baseline__" || scriptPath === "__connect__") {
    const tmp = await makeTmpDir("sandy-check-")
    await fs.writeFile(`${tmp.path}/${scriptPath}.ts`, checkScript(scriptPath))
    return tmp
  }
  return { path: path.dirname(path.resolve(scriptPath)), [Symbol.asyncDispose]: async () => {} }
}

export function checkScript(name: string): string {
  if (name === "__baseline__") {
    return 'console.log("sandy: baseline OK")\n'
  }
  // __connect__: verifies AWS SDK can reach IMDS
  return [
    'import { EC2Client, DescribeRegionsCommand } from "@aws-sdk/client-ec2"',
    "const client = new EC2Client({})",
    "const result = await client.send(new DescribeRegionsCommand({}))",
    'console.log(`sandy: connect OK (${result.Regions?.length ?? 0} regions)`)',
  ].join("\n") + "\n"
}
