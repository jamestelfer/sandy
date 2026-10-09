import type { CommandModule } from "yargs"
import type { ProgressCallback } from "../../core"
import { OutputHandler } from "../../output"
import type { Backend } from "../../sandbox"

export interface ImageArgs {
  action: "create" | "delete" | "current"
  force?: boolean
}

const UNKNOWN = "(unknown)"

export async function runImage(
  argv: ImageArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
  print: (line: string) => void = console.log,
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
    case "current": {
      if (!backend.imageInfo) {
        handler.stderrLine("sandy: image current is unsupported by this backend")
        process.exitCode = -1
        return
      }
      const info = await backend.imageInfo(handler)
      if (!info) {
        throw new Error("no image found — run 'sandy image create' first")
      }
      print(`created by sandy version: ${info.sandyVersion ?? UNKNOWN}`)
      print(`created: ${info.created?.toISOString() ?? UNKNOWN}`)
      break
    }
  }
}

export function makeImageCommand(backend: Backend, onProgress: ProgressCallback): CommandModule {
  return {
    command: ["image <action>", "snapshot <action>"],
    describe: "Create, delete, or describe the sandbox image used by run and check",
    builder: (y) =>
      y
        .positional("action", {
          choices: ["create", "delete", "current"] as const,
          demandOption: true,
          describe:
            "create: build the image; delete: remove it; current: show the Sandy version and creation time of the image",
        })
        .option("force", {
          type: "boolean",
          default: false,
          describe: "Remove all cached layers for a clean rebuild",
        })
        .example("$0 image create", "Build the sandbox image")
        .example("$0 image delete", "Remove the sandbox image")
        .example("$0 image delete --force", "Remove all cached layers")
        .example("$0 image current", "Show the Sandy version and creation time of the image"),
    handler: async (argv) => runImage(argv as unknown as ImageArgs, backend, onProgress),
  }
}
