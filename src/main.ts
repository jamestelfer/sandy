import { hideBin } from "yargs/helpers"
import yargs from "yargs"
import { readConfig } from "./config"
import configCommand from "./cli/config"
import { makeImageCommand } from "./cli/image"
import { makeCheckCommand } from "./cli/check"
import { makeRunCommand } from "./cli/run"
import { makeMcpCommand } from "./cli/mcp"
import { ShuruBackend } from "./shuru-backend"
import { DockerBackend } from "./docker-backend"
import Docker from "dockerode"
import type { Backend } from "./backend"
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

const onProgress: ProgressCallback = (msg: string) => process.stderr.write(`\x1b[1;36m→ ${msg}\x1b[0m\n`)

async function main(): Promise<void> {
  const backend = await createBackend()

  await yargs(hideBin(process.argv))
    .scriptName("sandy")
    .command(configCommand)
    .command(makeImageCommand(backend, onProgress))
    .command(makeCheckCommand(backend, onProgress))
    .command(makeRunCommand(backend, onProgress))
    .command(makeMcpCommand(backend))
    .demandCommand(1, "Specify a command")
    .strict()
    .help()
    .parseAsync()
}

main()
