import type { CommandModule } from "yargs"
import { readEmbeddedResource } from "../../resources"

const DIRECTIVE = [
  "> Read this entire output in full before acting. Do not pipe it through",
  "> head, tail, sed, less, or any pager. You are not primed until you reach",
  "> the END-OF-PRIME sentinel, and its line count matches the header.",
].join("\n")

export async function runPrime(print: (line: string) => void = console.log): Promise<void> {
  const skill = await readEmbeddedResource("sandy://skills/cli/SKILL.md")
  const lines = skill.split("\n").length

  print(`=== SANDY PRIME · lines=${lines} ===`)
  print(DIRECTIVE)
  print(skill)
  print(DIRECTIVE)
  print(`=== END-OF-PRIME · lines=${lines} ===`)
}

const primeCommand: CommandModule<Record<string, never>, Record<string, never>> = {
  command: "prime",
  describe:
    "Print the Sandy CLI skill (long) — run first; read the output in full, do not truncate with head/tail/pager",
  handler: async () => runPrime(),
}

export default primeCommand
