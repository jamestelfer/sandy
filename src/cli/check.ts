import type { Backend } from "../backend"
import { createSession } from "../session"
import { DEFAULT_REGION } from "../types"

export async function runCheck(
  args: string[],
  backend: Backend,
  print: (line: string) => void = console.log,
  printErr: (line: string) => void = console.error,
): Promise<number> {
  const subcommand = args[0]
  const rest = args.slice(1)

  if (subcommand === "baseline") {
    return runBaseline(backend, print, printErr)
  }
  if (subcommand === "connect") {
    return runConnect(rest, backend, print, printErr)
  }
  printErr(`sandy check: unknown subcommand: ${subcommand ?? "(none)"}`)
  printErr("Usage: sandy check baseline|connect")
  return 1
}

async function runBaseline(
  backend: Backend,
  print: (line: string) => void,
  printErr: (line: string) => void,
): Promise<number> {
  const session = await createSession()
  const result = await backend.run(
    {
      scriptPath: "__baseline__",
      imdsPort: 0,
      session: session.name,
      sessionDir: session.dir,
    },
    (msg) => print(`[--> ${msg}`),
  )
  if (result.exitCode !== 0) {
    printErr("baseline check failed")
  }
  return result.exitCode
}

async function runConnect(
  args: string[],
  backend: Backend,
  print: (line: string) => void,
  printErr: (line: string) => void,
): Promise<number> {
  let imdsPort: number | undefined
  let region = DEFAULT_REGION

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--imds-port" && args[i + 1]) {
      const parsed = Number(args[i + 1])
      if (Number.isNaN(parsed)) {
        printErr(`sandy check connect: --imds-port must be a number, got: ${args[i + 1]}`)
        return 1
      }
      imdsPort = parsed
      i++
    } else if (args[i] === "--region" && args[i + 1]) {
      region = args[i + 1] as string
      i++
    }
  }

  if (imdsPort === undefined) {
    printErr("sandy check connect: missing required flag: --imds-port <port>")
    return 1
  }

  const session = await createSession()
  const result = await backend.run(
    {
      scriptPath: "__connect__",
      imdsPort,
      region,
      session: session.name,
      sessionDir: session.dir,
    },
    (msg) => print(`[--> ${msg}`),
  )
  if (result.exitCode !== 0) {
    printErr("connect check failed")
  }
  return result.exitCode
}
