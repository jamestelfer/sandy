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
  describe: "Show or set the sandbox backend (shuru microVM or Docker)",
  builder: (y) =>
    y
      .option("docker", { type: "boolean", describe: "Switch to the Docker backend" })
      .option("shuru", { type: "boolean", describe: "Switch to the Shuru microVM backend" })
      .conflicts("docker", "shuru")
      .example("$0 config", "Print the current backend")
      .example("$0 config --docker", "Switch to the Docker backend")
      .example("$0 config --shuru", "Switch to the Shuru microVM backend"),
  handler: async (argv) => runConfig(argv as unknown as ConfigArgs),
}
export default configCommand
