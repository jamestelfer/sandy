import type { CommandModule } from "yargs"
import { DEFAULT_REGION, type ProgressCallback } from "../../core"
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
    describe: "Execute a TypeScript script from <session>/scripts/ inside the sandbox",
    builder: (y) =>
      y
        .option("script", {
          type: "string",
          demandOption: true,
          describe: "Script filename relative to the session scripts directory",
        })
        .option("imds-port", {
          type: "number",
          demandOption: true,
          describe: "Port of a running IMDS server on the host",
        })
        .option("region", {
          type: "string",
          default: DEFAULT_REGION,
          describe: `AWS region passed to the script (default ${DEFAULT_REGION})`,
        })
        .option("session", {
          type: "string",
          demandOption: true,
          describe: "Session name from 'sandy session create'",
        })
        .parserConfiguration({
          "populate--": true,
          "parse-positional-numbers": false,
        })
        .example(
          "$0 run --session s-abc --script list.ts --imds-port 8080",
          "Run list.ts inside the sandbox",
        )
        .example(
          "$0 run --session s-abc --script list.ts --imds-port 8080 --region ap-southeast-2",
          "Override the default region",
        )
        .example(
          "$0 run --session s-abc --script list.ts --imds-port 8080 -- --bucket my-bucket",
          "Forward arguments after -- to the script",
        )
        .epilogue("Arguments after -- are forwarded to the script as process.argv."),
    handler: async (argv) => runRun(argv as unknown as RunArgs, backend, onProgress),
  }
}
