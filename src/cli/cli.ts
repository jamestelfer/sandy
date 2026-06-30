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
    .usage("$0 <command>\n\nRun sandboxed TypeScript scripts with AWS SDK access via IMDS.")
    .epilog(
      "Run 'sandy prime' for the full CLI skill, or 'sandy resource' to list embedded guides. " +
        "'sandy prime' output is long: read it in full and do not truncate with head, tail, or a pager.",
    )
    .demandCommand(1, "Specify a command")
    .strict()
    .help()
}
