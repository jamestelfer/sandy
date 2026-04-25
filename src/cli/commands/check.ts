import { basename, join } from "node:path"
import type { CommandModule } from "yargs"
import type { ProgressCallback } from "../../core/types"
import { DEFAULT_REGION } from "../../core/types"
import { OutputHandler } from "../../output/handler"
import { extractEmbeddedChecks } from "../../resources/checks"
import type { Backend } from "../../sandbox/backend"
import { Session } from "../../session/session"
import { establishWorkDir } from "../../session/workdir"

export interface ConnectArgs {
  imdsPort: number
  region: string
}

async function runCheck(
  backend: Backend,
  onProgress: ProgressCallback,
  checkName: "baseline" | "connect",
  imdsPort: number,
  region: string,
  label: string,
): Promise<void> {
  await establishWorkDir()
  const handler = new OutputHandler(onProgress)
  const imageExists = await backend.imageExists(handler)
  if (!imageExists) {
    const exe = basename(process.argv[1])
    handler.stderrLine(`sandy: no image found — run '${exe} image create' first`)
    process.exitCode = 1
    return
  }

  await using session = await Session.ephemeral()
  await extractEmbeddedChecks(session.scriptsDir)
  const scriptPath = join(session.scriptsDir, `${checkName}.ts`)

  const result = await backend.run(
    { scriptPath, imdsPort, region, session: session.name, sessionDir: session.dir },
    handler,
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
  await runCheck(backend, onProgress, "baseline", 0, DEFAULT_REGION, "baseline")
}

export async function runConnect(
  argv: ConnectArgs,
  backend: Backend,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  await runCheck(backend, onProgress, "connect", argv.imdsPort, argv.region, "connect")
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
