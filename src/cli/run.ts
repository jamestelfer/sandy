import type { CommandModule } from "yargs"
import type { Backend } from "../backend"
import { OutputHandler } from "../output-handler"
import { createSession } from "../session"
import type { ProgressCallback } from "../types"
import { DEFAULT_REGION } from "../types"

export interface RunArgs {
  script: string
  imdsPort: number
  region: string
  session?: string
  outputDir?: string
  "--"?: string[]
}

export async function runRun(
  argv: RunArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  const handler = new OutputHandler(onProgress)
  const session = await createSession(argv.session, argv.outputDir)
  handler.stdoutLine(`sandy: output directory: ${session.dir}`)

  const result = await backend.run(
    {
      scriptPath: argv.script,
      imdsPort: argv.imdsPort,
      region: argv.region,
      session: session.name,
      sessionDir: session.dir,
      scriptArgs: argv["--"],
    },
    handler,
  )

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode
  }
}

export function makeRunCommand(backend: Backend, onProgress: ProgressCallback): CommandModule {
  return {
    command: "run",
    describe: "Run a TypeScript script",
    builder: (y) =>
      y
        .option("script", { type: "string", demandOption: true })
        .option("imds-port", { type: "number", demandOption: true })
        .option("region", { type: "string", default: DEFAULT_REGION })
        .option("session", { type: "string" })
        .option("output-dir", { type: "string" })
        .parserConfiguration({ "populate--": true }),
    handler: async (argv) => runRun(argv as unknown as RunArgs, backend, onProgress),
  }
}
