import { readConfig } from "./config"
import { runConfig } from "./cli/config"
import { runImage } from "./cli/image"
import { runCheck } from "./cli/check"
import { runRun } from "./cli/run"
import { runMcp } from "./cli/mcp"
import { DummyBackend } from "./dummy-backend"
import { ShuruBackend } from "./shuru-backend"
import type { Backend } from "./backend"

function usage(): void {
  console.error(`Usage: sandy <command> [options]

Commands:
  config [--docker|--shuru]           Show or set the backend
  image create|delete                 Manage the sandbox image
  check baseline|connect              Run health checks
  run --script <path> --imds-port <n> Run a TypeScript script
  mcp                                 Start the MCP server
`)
}

async function createBackend(): Promise<Backend> {
  const config = await readConfig()
  switch (config.backend) {
    case "shuru":
      return new ShuruBackend()
    case "docker":
      // Phase 5: DockerBackend
      return new DummyBackend()
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage()
    process.exit(command ? 0 : 1)
  }

  const rest = args.slice(1)

  if (command === "config") {
    process.exit(await runConfig(rest))
  }

  const backend = await createBackend()

  if (command === "image") {
    process.exit(await runImage(rest, backend))
  }
  if (command === "check") {
    process.exit(await runCheck(rest, backend))
  }
  if (command === "run") {
    process.exit(await runRun(rest, backend))
  }
  if (command === "mcp") {
    process.exit(await runMcp())
  }

  console.error(`sandy: unknown command: ${command}`)
  usage()
  process.exit(1)
}

main()
