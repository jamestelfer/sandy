import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol"
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types"
import { z } from "zod"
import type { Logger } from "../../logging"
import type {
  SandyCheckResult,
  SandyRunParams,
  SandyRunResult,
  SandySessionResult,
} from "../server"

interface RegisterToolsDeps {
  logger: Logger
  progressFromContext: (
    ctx: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ) => (message: string) => void | Promise<void>
  handleSandyImage: (
    onProgress: (message: string) => void | Promise<void>,
    action: "create" | "delete",
    force?: boolean,
  ) => Promise<void>
  handleSandyCheck: (
    onProgress: (message: string) => void | Promise<void>,
    action: "baseline" | "connect",
    imdsPort?: number,
    region?: string,
  ) => Promise<SandyCheckResult>
  handleSandyRun: (
    params: SandyRunParams,
    onProgress?: (message: string) => void | Promise<void>,
  ) => Promise<SandyRunResult>
  handleCreateSession: () => Promise<SandySessionResult>
  handleResumeSession: (sessionName: string) => Promise<SandySessionResult>
  handlePrime: () => Promise<string>
}

const regionSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[a-z]+)+-\d+$/, "invalid AWS region format")
  .optional()

export function registerMcpTools(server: McpServer, deps: RegisterToolsDeps): void {
  server.registerTool(
    "sandy_image",
    {
      description: "Create or delete the Sandy sandbox image",
      inputSchema: z.object({
        action: z.enum(["create", "delete"]).describe('"create" or "delete"'),
        force: z
          .boolean()
          .optional()
          .describe(
            "Remove all cached layers for a clean rebuild, takes more time (delete action only)",
          ),
      }),
    },
    async ({ action, force }, ctx) => {
      const onProgress = deps.progressFromContext(ctx)
      await deps.handleSandyImage(onProgress, action, force)
      return {
        content: [{ type: "text" as const, text: `Image ${action} complete.` }],
      }
    },
  )

  server.registerTool(
    "sandy_check",
    {
      description: "Run a health check (baseline or connect). Uses an ephemeral session.",
      inputSchema: z.object({
        action: z.enum(["baseline", "connect"]).describe('"baseline" or "connect"'),
        imdsPort: z.number().optional().describe("IMDS port (required for connect)"),
        region: regionSchema.describe("AWS region (default: us-west-2)"),
      }),
    },
    async ({ action, imdsPort, region }, ctx) => {
      const onProgress = deps.progressFromContext(ctx)
      const result = await deps.handleSandyCheck(onProgress, action, imdsPort, region)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      }
    },
  )

  server.registerTool(
    "sandy_run",
    {
      description: "Run a TypeScript script in the Sandy sandbox",
      inputSchema: z.object({
        session: z.string().min(1).describe("Session name"),
        script: z.string().describe("Path to the TypeScript script under session scripts/"),
        content: z
          .string()
          .optional()
          .describe("Optional inline script content to write before run"),
        imdsPort: z.number().describe("IMDS server port on the host"),
        region: regionSchema.describe("AWS region (default: us-west-2)"),
        args: z.array(z.string()).optional().describe("Arguments passed to the script"),
      }),
    },
    async ({ session, script, content, imdsPort, region, args }, ctx) => {
      const onProgress = deps.progressFromContext(ctx)
      const result = await deps.handleSandyRun(
        { session, script, content, imdsPort, region, args },
        onProgress,
      )
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      }
    },
  )

  server.registerTool(
    "sandy_create_session",
    {
      description: "Create a session and return its scripts path",
      inputSchema: z.object({}),
    },
    async () => {
      deps.logger.info({ tool: "sandy_create_session" }, "invoked")
      const result = await deps.handleCreateSession()
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      }
    },
  )

  server.registerTool(
    "sandy_resume_session",
    {
      description: "Resume an existing session and return its scripts path",
      inputSchema: z.object({
        sessionName: z.string().describe("Session name to resume"),
      }),
    },
    async ({ sessionName }) => {
      deps.logger.info({ tool: "sandy_resume_session", session: sessionName }, "invoked")
      const result = await deps.handleResumeSession(sessionName)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      }
    },
  )

  server.registerTool(
    "prime",
    {
      description: "Return the MCP SKILL.md content",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: "text" as const, text: await deps.handlePrime() }],
    }),
  )
}
