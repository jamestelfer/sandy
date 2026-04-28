import type { CommandModule } from "yargs"
import { establishWorkDir, Session } from "../../session"

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
  describe: "Manage Sandy sessions (currently: create)",
  builder: (y) =>
    y.command(
      "create",
      "Create a session and print its name and scripts directory",
      (y) => y.example("$0 session create", "Allocate a new session directory"),
      async () => {
        await runSessionCreate()
      },
    ),
  handler: () => {},
}

export default sessionCommand
