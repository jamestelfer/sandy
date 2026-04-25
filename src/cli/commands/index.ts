import type { Argv } from "yargs"
import type { ProgressCallback } from "../../core/types"
import type { Backend } from "../../sandbox/backend"
import { makeCheckCommand } from "./check"
import configCommand from "./config"
import { makeImageCommand } from "./image"
import { makeMcpCommand } from "./mcp"
import primeCommand from "./prime"
import resourceCommand from "./resource"
import { makeRunCommand } from "./run"
import sessionCommand from "./session"

export function registerCommands(
  parser: Argv,
  backend: Backend,
  onProgress: ProgressCallback,
): Argv {
  return parser
    .command(configCommand)
    .command(makeImageCommand(backend, onProgress))
    .command(makeCheckCommand(backend, onProgress))
    .command(makeRunCommand(backend, onProgress))
    .command(sessionCommand)
    .command(makeMcpCommand(backend))
    .command(resourceCommand)
    .command(primeCommand)
}
