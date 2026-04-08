import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { Backend } from "../backend"
import { SandyMcpServer } from "../mcp-server"

export async function runMcp(
  backend: Backend,
  printErr: (line: string) => void = console.error,
): Promise<number> {
  try {
    const sandy = new SandyMcpServer(backend)
    const server = sandy.createMcpServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
    return 0
  } catch (err) {
    printErr(`sandy mcp: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
