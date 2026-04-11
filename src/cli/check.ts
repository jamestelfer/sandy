import type { CommandModule } from "yargs"
import type { Backend } from "../backend"
import { createSession } from "../session"
import type { ProgressCallback } from "../types"
import { DEFAULT_REGION } from "../types"

export interface ConnectArgs {
  imdsPort: number
  region: string
}

export async function runBaseline(
  backend: Backend,
  onProgress: ProgressCallback = () => {},
  print: (line: string) => void = console.log,
  printErr: (line: string) => void = console.error,
): Promise<void> {
  const session = await createSession()
  const result = await backend.run(
    {
      scriptPath: "__baseline__",
      imdsPort: 0,
      session: session.name,
      sessionDir: session.dir,
    },
    onProgress,
  )
  if (result.exitCode !== 0) {
    printErr("baseline check failed")
  }
}

export async function runConnect(
  argv: ConnectArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
  print: (line: string) => void = console.log,
  printErr: (line: string) => void = console.error,
): Promise<void> {
  const session = await createSession()
  const result = await backend.run(
    {
      scriptPath: "__connect__",
      imdsPort: argv.imdsPort,
      region: argv.region,
      session: session.name,
      sessionDir: session.dir,
    },
    onProgress,
  )
  if (result.exitCode !== 0) {
    printErr("connect check failed")
  }
}

export function makeCheckCommand(backend: Backend, onProgress: ProgressCallback): CommandModule {
  return {
    command: "check",
    describe: "Run health checks",
    builder: (y) =>
      y
        .command("baseline", "Run baseline health check", {}, async () =>
          runBaseline(backend, onProgress),
        )
        .command(
          "connect",
          "Run connectivity check",
          (y) =>
            y
              .option("imds-port", { type: "number", demandOption: true })
              .option("region", { type: "string", default: DEFAULT_REGION }),
          async (argv) => runConnect(argv as unknown as ConnectArgs, backend, onProgress),
        )
        .demandCommand(1),
    handler: () => {},
  }
}
