import { basename } from "node:path"
import type { CommandModule } from "yargs"
import type { Backend } from "../backend"
import { OutputHandler } from "../output-handler"
import { createSession } from "../session"
import type { ProgressCallback, RunOptions } from "../types"
import { DEFAULT_REGION } from "../types"

export interface ConnectArgs {
  imdsPort: number
  region: string
}

async function runCheck(
  backend: Backend,
  onProgress: ProgressCallback,
  opts: Omit<RunOptions, "session" | "sessionDir">,
  label: string,
): Promise<void> {
  const handler = new OutputHandler(onProgress)
  const imageExists = await backend.imageExists(onProgress)
  if (!imageExists) {
    const exe = basename(process.argv[1])
    handler.stderrLine(`sandy: no image found — run '${exe} image create' first`)
    process.exitCode = 1
    return
  }
  const session = await createSession()
  const result = await backend.run(
    { ...opts, session: session.name, sessionDir: session.dir },
    onProgress,
  )
  if (result.exitCode !== 0) {
    handler.stderrLine(`sandy: ${label} check failed`)
    process.exitCode = 1
  } else {
    handler.stdoutLine(`sandy: ${label} check passed`)
  }
}

export async function runBaseline(
  backend: Backend,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  await runCheck(backend, onProgress, { scriptPath: "__baseline__", imdsPort: 0 }, "baseline")
}

export async function runConnect(
  argv: ConnectArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  await runCheck(
    backend,
    onProgress,
    { scriptPath: "__connect__", imdsPort: argv.imdsPort, region: argv.region },
    "connect",
  )
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
