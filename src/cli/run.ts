import type { Backend } from "../backend"
import { createSession } from "../session"
import { DEFAULT_REGION } from "../types"

export async function runRun(
  args: string[],
  backend: Backend,
  print: (line: string) => void = console.log,
  printErr: (line: string) => void = console.error,
): Promise<number> {
  let scriptPath: string | undefined
  let imdsPort: number | undefined
  let region = DEFAULT_REGION
  let sessionName: string | undefined
  const scriptArgs: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--") {
      scriptArgs.push(...args.slice(i + 1))
      break
    } else if (arg === "--script" && args[i + 1]) {
      scriptPath = args[i + 1]
      i++
    } else if (arg === "--imds-port" && args[i + 1]) {
      const parsed = Number(args[i + 1])
      if (Number.isNaN(parsed)) {
        printErr(`sandy run: --imds-port must be a number, got: ${args[i + 1]}`)
        return 1
      }
      imdsPort = parsed
      i++
    } else if (arg === "--region" && args[i + 1]) {
      region = args[i + 1] as string
      i++
    } else if (arg === "--session" && args[i + 1]) {
      sessionName = args[i + 1]
      i++
    }
  }

  if (!scriptPath) {
    printErr("sandy run: missing required flag: --script <path>")
    return 1
  }
  if (imdsPort === undefined) {
    printErr("sandy run: missing required flag: --imds-port <port>")
    return 1
  }

  const session = await createSession(sessionName)
  printErr(`sandy: output directory: ${session.dir}`)

  const result = await backend.run(
    {
      scriptPath,
      imdsPort,
      region,
      session: session.name,
      sessionDir: session.dir,
      scriptArgs,
    },
    (msg) => print(`[--> ${msg}`),
  )

  if (result.stdout) {
    print(result.stdout)
  }

  return result.exitCode
}
