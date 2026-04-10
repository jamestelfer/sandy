import type { CommandModule } from "yargs"
import type { Backend } from "../backend"
import { OutputHandler } from "../output-handler"
import type { ProgressCallback } from "../types"

export interface ImageArgs {
  action: "create" | "delete"
}

export async function runImage(
  argv: ImageArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  const handler = new OutputHandler(onProgress)
  switch (argv.action) {
    case "create":
      await backend.imageCreate(onProgress)
      handler.stdoutLine("image created")
      break
    case "delete":
      await backend.imageDelete(onProgress)
      handler.stdoutLine("image deleted")
      break
  }
}

export function makeImageCommand(backend: Backend, onProgress: ProgressCallback): CommandModule {
  return {
    command: ["image <action>", "snapshot <action>"],
    describe: "Manage the sandbox image",
    builder: (y) =>
      y.positional("action", {
        choices: ["create", "delete"] as const,
        demandOption: true,
      }),
    handler: async (argv) => runImage(argv as unknown as ImageArgs, backend, onProgress),
  }
}
