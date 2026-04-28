import type { CommandModule } from "yargs"
import type { ProgressCallback } from "../../core"
import { OutputHandler } from "../../output"
import type { Backend } from "../../sandbox"

export interface ImageArgs {
  action: "create" | "delete"
  force?: boolean
}

export async function runImage(
  argv: ImageArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  const handler = new OutputHandler(onProgress)
  switch (argv.action) {
    case "create":
      await backend.imageCreate(handler)
      handler.stdoutLine("image created")
      break
    case "delete":
      await backend.imageDelete(handler, argv.force ?? false)
      handler.stdoutLine("image deleted")
      break
  }
}

export function makeImageCommand(backend: Backend, onProgress: ProgressCallback): CommandModule {
  return {
    command: ["image <action>", "snapshot <action>"],
    describe: "Create or delete the sandbox image used by run and check",
    builder: (y) =>
      y
        .positional("action", {
          choices: ["create", "delete"] as const,
          demandOption: true,
          describe: "create: build the image; delete: remove it",
        })
        .option("force", {
          type: "boolean",
          default: false,
          describe: "Remove all cached layers for a clean rebuild",
        })
        .example("$0 image create", "Build the sandbox image")
        .example("$0 image delete", "Remove the sandbox image")
        .example("$0 image delete --force", "Remove all cached layers"),
    handler: async (argv) => runImage(argv as unknown as ImageArgs, backend, onProgress),
  }
}
