import type { CommandModule } from "yargs"
import { Session } from "../session"
import { establishWorkDir } from "../workdir"

export interface SessionCreateResult {
  sessionName: string
  scriptsPath: string
}

export async function runSessionCreate(
  writeLine: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`)
  },
): Promise<SessionCreateResult> {
  await establishWorkDir()
  const session = await Session.create()

  writeLine(`sandy: session: ${session.name}`)
  writeLine(`sandy: scripts: ${session.scriptsDir}`)

  return {
    sessionName: session.name,
    scriptsPath: session.scriptsDir,
  }
}

const sessionCommand: CommandModule = {
  command: "session",
  describe: "Manage sessions",
  builder: (y) =>
    y.command(
      "create",
      "Create a new session and print its name and scripts directory path. Write scripts into that path before invoking `run`.",
      () => {},
      async () => {
        await runSessionCreate()
      },
    ),
  handler: () => {},
}

export default sessionCommand
