import yargs, { type Argv } from "yargs"
import { hideBin } from "yargs/helpers"
import type { ProgressCallback } from "../core"
import type { Backend } from "../sandbox"
import { registerCommands } from "./commands"

export function makeCli(
  backend: Backend,
  onProgress: ProgressCallback,
  argv = hideBin(process.argv),
): Argv {
  const parser = yargs(argv).scriptName("sandy")
  return registerCommands(parser, backend, onProgress)
    .demandCommand(1, "Specify a command")
    .strict()
    .help()
}
