import Docker from "dockerode"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import type { Backend } from "./backend"
import { makeCheckCommand } from "./cli/check"
import configCommand from "./cli/config"
import { makeImageCommand } from "./cli/image"
import { makeMcpCommand } from "./cli/mcp"
import primeCommand from "./cli/prime"
import resourceCommand from "./cli/resource"
import { makeRunCommand } from "./cli/run"
import sessionCommand from "./cli/session"
import { readConfig } from "./config"
import { DockerBackend } from "./docker-backend"
import { ShuruBackend } from "./shuru-backend"
import type { ProgressCallback } from "./types"

async function createBackend(): Promise<Backend> {
  const config = await readConfig()
  switch (config.backend) {
    case "shuru":
      return new ShuruBackend()
    case "docker":
      return new DockerBackend(new Docker())
  }
}

const onProgress: ProgressCallback = (msg: string) => {
  const underline = "─".repeat(msg.length)
  process.stderr.write(`\n\x1b[1;36m→ ${msg}\n  ${underline}\x1b[0m\n`)
}

async function main(): Promise<void> {
  const backend = await createBackend()

  await yargs(hideBin(process.argv))
    .scriptName("sandy")
    .command(configCommand)
    .command(makeImageCommand(backend, onProgress))
    .command(makeCheckCommand(backend, onProgress))
    .command(makeRunCommand(backend, onProgress))
    .command(sessionCommand)
    .command(makeMcpCommand(backend))
    .command(resourceCommand)
    .command(primeCommand)
    .demandCommand(1, "Specify a command")
    .strict()
    .help()
    .parseAsync()
}

main()
