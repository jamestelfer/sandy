import type { CommandModule } from "yargs"
import type { ProgressCallback } from "../../core"
import { DEFAULT_REGION } from "../../core"
import { OutputHandler } from "../../output"
import type { Backend } from "../../sandbox"
import { establishWorkDir, Session } from "../../session"

export interface RunArgs {
  script: string
  imdsPort: number
  region: string
  session: string
  "--"?: string[]
}

export async function runRun(
  argv: RunArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  await establishWorkDir()

  const handler = new OutputHandler(onProgress)
  const session = await Session.resume(argv.session)
  const scriptPath = await session.resolveScript(argv.script)

  handler.stdoutLine(`sandy: output directory: ${session.dir}`)

  const result = await backend.run(
    {
      scriptPath,
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
        .option("session", { type: "string", demandOption: true })
        .parserConfiguration({
          "populate--": true,
          "parse-positional-numbers": false,
        }),
    handler: async (argv) => runRun(argv as unknown as RunArgs, backend, onProgress),
  }
}
