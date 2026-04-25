import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"

function mimeTypeForUri(uri: string): string {
  const dot = uri.lastIndexOf(".")
  const ext = dot >= 0 ? uri.slice(dot) : ""
  switch (ext) {
    case ".md":
      return "text/markdown"
    case ".ts":
      return "text/plain"
    case ".json":
      return "application/json"
    default:
      return "application/octet-stream"
  }
}

export function registerMcpResources(
  server: McpServer,
  deps: {
    listEmbeddedResourceUris: () => Promise<string[]>
    readEmbeddedResource: (uri: string) => Promise<string>
  },
): void {
  const embeddedTemplate = new ResourceTemplate("sandy://{+path}", {
    list: async () => ({
      resources: (await deps.listEmbeddedResourceUris()).map((uri) => ({
        uri,
        name: uri.replace("sandy://", ""),
        mimeType: mimeTypeForUri(uri),
      })),
    }),
  })

  server.registerResource(
    "embedded",
    embeddedTemplate,
    { description: "All embedded Sandy resources" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: await deps.readEmbeddedResource(uri.href),
          mimeType: mimeTypeForUri(uri.href),
        },
      ],
    }),
  )
}
