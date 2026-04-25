import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { CommandModule } from "yargs"
import { createLogger, type Logger } from "../../logging"
import { SandyMcpServer } from "../../mcp"
import type { Backend } from "../../sandbox"
import { establishWorkDir } from "../../session"

export async function runMcp(
  backend: Backend,
  printErr: (line: string) => void = console.error,
  logger: Logger = createLogger(),
): Promise<number> {
  try {
    logger.info("MCP server starting")
    await establishWorkDir()
    const sandy = new SandyMcpServer(backend, logger)
    const server = sandy.createMcpServer()

    server.server.oninitialized = () => {
      const capabilities = server.server.getClientCapabilities()
      const version = server.server.getClientVersion()
      logger.info({ version, capabilities }, "Client attributes")
    }

    const transport = new StdioServerTransport()
    await server.connect(transport)
    return 0
  } catch (err) {
    logger.error({ err }, "MCP server failed")
    printErr(`sandy mcp: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export function makeMcpCommand(backend: Backend): CommandModule {
  return {
    command: "mcp",
    describe: "Start the MCP server",
    handler: async () => {
      const code = await runMcp(backend)
      if (code !== 0) {
        process.exit(code)
      }
    },
  }
}
