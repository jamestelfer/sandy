import type { CommandModule } from "yargs"
import { readConfig, writeConfig } from "../../core"

export interface ConfigArgs {
  docker: boolean
  shuru: boolean
}

export async function runConfig(
  argv: ConfigArgs,
  print: (line: string) => void = console.log,
): Promise<void> {
  if (argv.docker) {
    await writeConfig({ backend: "docker" })
    print("backend: docker")
    return
  }
  if (argv.shuru) {
    await writeConfig({ backend: "shuru" })
    print("backend: shuru")
    return
  }
  const config = await readConfig()
  print(`backend: ${config.backend}`)
}

const configCommand: CommandModule = {
  command: "config",
  describe: "Show or set the backend",
  builder: (y) =>
    y
      .option("docker", { type: "boolean" })
      .option("shuru", { type: "boolean" })
      .conflicts("docker", "shuru"),
  handler: async (argv) => runConfig(argv as unknown as ConfigArgs),
}
export default configCommand
