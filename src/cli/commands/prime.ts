import type { CommandModule } from "yargs"
import { readEmbeddedResource } from "../../resources"

export async function runPrime(print: (line: string) => void = console.log): Promise<void> {
  const skill = await readEmbeddedResource("sandy://skills/cli/SKILL.md")
  print(skill)
}

const primeCommand: CommandModule<Record<string, never>, Record<string, never>> = {
  command: "prime",
  describe: "Print the Sandy CLI skill — run this first to learn commands and workflow",
  handler: async () => runPrime(),
}

export default primeCommand
