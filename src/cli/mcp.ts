import type { CommandModule } from "yargs"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { Backend } from "../backend"
import { SandyMcpServer } from "../mcp-server"
import type { Logger } from "../logger"
import { createLogger } from "../logger"

export async function runMcp(
  backend: Backend,
  printErr: (line: string) => void = console.error,
  logger: Logger = createLogger(),
): Promise<number> {
  try {
    logger.info("MCP server starting")
    const sandy = new SandyMcpServer(backend, process.cwd(), logger)
    const server = sandy.createMcpServer()
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
