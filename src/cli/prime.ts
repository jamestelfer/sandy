import type { CommandModule } from "yargs"
import { readEmbeddedResource } from "../embedded-fs"

export async function runPrime(print: (line: string) => void = console.log): Promise<void> {
  const content = await readEmbeddedResource("sandy://skills/cli/SKILL.md")
  print(content)
}

const primeCommand: CommandModule = {
  command: "prime",
  describe: "Print the Sandy CLI skill content",
  handler: async () => runPrime(),
}

export default primeCommand
