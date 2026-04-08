import { readConfig, writeConfig } from "../config"

export async function runConfig(
  args: string[],
  print: (line: string) => void = console.log,
  _printErr: (line: string) => void = console.error,
): Promise<number> {
  if (args.includes("--docker")) {
    await writeConfig({ backend: "docker" })
    print("backend: docker")
    return 0
  }
  if (args.includes("--shuru")) {
    await writeConfig({ backend: "shuru" })
    print("backend: shuru")
    return 0
  }
  const config = await readConfig()
  print(`backend: ${config.backend}`)
  return 0
}
