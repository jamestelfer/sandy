import { basename, join } from "node:path"
import type { CommandModule } from "yargs"
import { DEFAULT_REGION, type ProgressCallback } from "../../core"
import { OutputHandler } from "../../output"
import { extractEmbeddedChecks } from "../../resources"
import type { Backend } from "../../sandbox"
import { establishWorkDir, Session } from "../../session"

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
    describe: "Run sandbox health checks (baseline executes a script; connect verifies IMDS)",
    builder: (y) =>
      y
        .command(
          "baseline",
          "Verify the sandbox can execute a TypeScript script",
          (y) => y.example("$0 check baseline", "Run the baseline script inside the sandbox"),
          async () => runBaseline(backend, onProgress),
        )
        .command(
          "connect",
          "Verify the sandbox can reach the IMDS server on the host",
          (y) =>
            y
              .option("imds-port", {
                type: "number",
                demandOption: true,
                describe: "Port of a running IMDS server on the host",
              })
              .option("region", {
                type: "string",
                default: DEFAULT_REGION,
                describe: `AWS region for the check (default ${DEFAULT_REGION})`,
              })
              .example("$0 check connect --imds-port 8080", "Check IMDS reachability on port 8080")
              .example(
                "$0 check connect --imds-port 8080 --region ap-southeast-2",
                "Override the default region",
              ),
          async (argv) => runConnect(argv as unknown as ConnectArgs, backend, onProgress),
        )
        .demandCommand(1),
    handler: () => {},
  }
}
