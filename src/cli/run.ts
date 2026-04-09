import type { CommandModule } from "yargs"
import type { Backend } from "../backend"
import { createSession } from "../session"
import { DEFAULT_REGION } from "../types"

export interface RunArgs {
  script: string
  imdsPort: number
  region: string
  session?: string
  "--"?: string[]
}

export async function runRun(
  argv: RunArgs,
  backend: Backend,
  print: (line: string) => void = console.log,
  printErr: (line: string) => void = console.error,
): Promise<void> {
  const session = await createSession(argv.session)
  printErr(`sandy: output directory: ${session.dir}`)

  const result = await backend.run(
    {
      scriptPath: argv.script,
      imdsPort: argv.imdsPort,
      region: argv.region,
      session: session.name,
      sessionDir: session.dir,
      scriptArgs: argv["--"],
    },
    (msg) => print(`[--> ${msg}`),
  )

  if (result.stdout) {
    print(result.stdout)
  }
}

export function makeRunCommand(backend: Backend): CommandModule {
  return {
    command: "run",
    describe: "Run a TypeScript script",
    builder: (y) =>
      y
        .option("script", { type: "string", demandOption: true })
        .option("imds-port", { type: "number", demandOption: true })
        .option("region", { type: "string", default: DEFAULT_REGION })
        .option("session", { type: "string" })
        .parserConfiguration({ "populate--": true }),
    handler: async (argv) => runRun(argv as unknown as RunArgs, backend),
  }
}
