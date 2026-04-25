import { join } from "node:path"
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol"
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types"
import { z } from "zod"
import type { Backend } from "./backend"
import { extractEmbeddedChecks } from "./checks"
import { listEmbeddedResourceUris, readEmbeddedResource } from "./embedded-fs"
import type { Logger } from "./logger"
import { noopLogger } from "./logger"
import { OutputHandler } from "./output-handler"
import { Session } from "./session"
import type { ProgressCallback, RunOptions } from "./types"
import { DEFAULT_REGION } from "./types"

export interface SandyRunParams {
  session: string
  script: string
  content?: string
  imdsPort: number
  region?: string
  args?: string[]
}

export interface SandyRunResult {
  exitCode: number
  output: string
  sessionName: string
}

export interface SandyCheckResult {
  exitCode: number
  output: string
}

export interface SandySessionResult {
  sessionName: string
  scriptsPath: string
}

// Matches standard, gov, and China region names e.g. us-east-1, us-gov-east-1, cn-north-1
const regionSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[a-z]+)+-\d+$/, "invalid AWS region format")
  .optional()

export const handlerProgressCallback = (
  handlerContext: RequestHandlerExtra<ServerRequest, ServerNotification>,
): ProgressCallback => {
  const token = handlerContext._meta?.progressToken
  if (token === undefined) {
    return async (_message: string) => {}
  }

  let notificationCount = 1
  return async (message: string) => {
    await handlerContext.sendNotification({
      method: "notifications/progress",
      params: {
        progressToken: token,
        progress: notificationCount++,
        message,
      },
    })
  }
}

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

export class SandyMcpServer {
  constructor(
    private backend: Backend,
    private readonly logger: Logger = noopLogger(),
  ) {}

  private createOutputHandler(onProgress?: ProgressCallback): OutputHandler {
    const progress = onProgress ?? (() => {})
    if (this.logger.isLevelEnabled("debug")) {
      return new OutputHandler(progress, (line) => {
        this.logger.debug({ source: "output" }, line)
      })
    }
    return new OutputHandler(progress)
  }

  // ── Resource handlers ────────────────────────────────────────────────────

  async handlePrime(): Promise<string> {
    return readEmbeddedResource("sandy://skills/mcp/SKILL.md")
  }

  // ── Tool handlers ────────────────────────────────────────────────────────

  async handleSandyCheck(
    onProgress: ProgressCallback,
    action: "baseline" | "connect",
    imdsPort?: number,
    region?: string,
  ): Promise<SandyCheckResult> {
    const log = this.logger.child({ tool: "sandy_check" })

    try {
      log.info({ action, imdsPort, region }, "invoked")

      const handler = this.createOutputHandler(onProgress)
      const imageExists = await this.backend.imageExists(handler)
      if (!imageExists) {
        log.error("no image found")
        return {
          exitCode: 1,
          output:
            "No image found. Use the sandy_image tool with action 'create' to build one first.",
        }
      }

      await using session = await Session.ephemeral()
      await extractEmbeddedChecks(session.scriptsDir)
      const scriptPath = join(session.scriptsDir, `${action}.ts`)

      const opts: RunOptions = {
        scriptPath,
        imdsPort: imdsPort ?? 0,
        region: region ?? DEFAULT_REGION,
        session: session.name,
        sessionDir: session.dir,
      }
      const result = await this.backend.run(opts, handler)

      log.info({ exitCode: result.exitCode }, "complete")

      return {
        exitCode: result.exitCode,
        output: result.output,
      }
    } catch (err) {
      log.error({ err }, "failed")
      throw err
    }
  }

  async handleSandyImage(
    onProgress: ProgressCallback,
    action: "create" | "delete",
    force?: boolean,
  ): Promise<void> {
    const log = this.logger.child({ tool: "sandy_image" })

    try {
      log.info({ action, force }, "invoked")

      const handler = this.createOutputHandler(onProgress)
      if (action === "create") {
        await this.backend.imageCreate(handler)
      } else {
        await this.backend.imageDelete(handler, force)
      }

      log.info({ action }, "complete")
    } catch (err) {
      log.error({ err }, "failed")
      throw err
    }
  }

  async handleCreateSession(): Promise<SandySessionResult> {
    const session = await Session.create()
    this.logger.info({ session: session.name }, "session created by request")
    return { sessionName: session.name, scriptsPath: session.scriptsDir }
  }

  async handleResumeSession(sessionName: string): Promise<SandySessionResult> {
    const session = await Session.resume(sessionName)
    this.logger.info({ session: session.name }, "session resume requested")
    return { sessionName: session.name, scriptsPath: session.scriptsDir }
  }

  async handleSandyRun(
    params: SandyRunParams,
    onProgress?: ProgressCallback,
  ): Promise<SandyRunResult> {
    const log = this.logger.child({ tool: "sandy_run" })

    try {
      log.info({ session: params.session, script: params.script, region: params.region }, "invoked")

      if (!params.session.trim()) {
        throw new Error("session is required; use sandy_create_session to create one")
      }

      const session = await Session.resume(params.session)
      const scriptPath =
        params.content === undefined
          ? await session.resolveScript(params.script)
          : await session.writeScript(params.script, params.content)

      const opts: RunOptions = {
        scriptPath,
        imdsPort: params.imdsPort,
        region: params.region ?? DEFAULT_REGION,
        session: session.name,
        sessionDir: session.dir,
        scriptArgs: params.args,
      }

      const handler = this.createOutputHandler(onProgress)
      const result = await this.backend.run(opts, handler)

      log.info({ exitCode: result.exitCode, session: session.name }, "complete")

      return {
        exitCode: result.exitCode,
        output: result.output,
        sessionName: session.name,
      }
    } catch (err) {
      log.error({ err }, "failed")
      throw err
    }
  }

  // ── MCP SDK wiring ───────────────────────────────────────────────────────

  createMcpServer(): McpServer {
    const server = new McpServer({ name: "sandy", version: "0.1.0" })

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
        const onProgress = handlerProgressCallback(ctx)
        await this.handleSandyImage(onProgress, action, force)
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
        const onProgress = handlerProgressCallback(ctx)
        const result = await this.handleSandyCheck(onProgress, action, imdsPort, region)
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
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
        const onProgress = handlerProgressCallback(ctx)

        const result = await this.handleSandyRun(
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
        this.logger.info({ tool: "sandy_create_session" }, "invoked")
        const result = await this.handleCreateSession()
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
        this.logger.info({ tool: "sandy_resume_session", session: sessionName }, "invoked")
        const result = await this.handleResumeSession(sessionName)
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
        content: [{ type: "text" as const, text: await this.handlePrime() }],
      }),
    )

    const embeddedTemplate = new ResourceTemplate("sandy://{+path}", {
      list: async () => ({
        resources: (await listEmbeddedResourceUris()).map((uri) => ({
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
            text: await readEmbeddedResource(uri.href),
            mimeType: mimeTypeForUri(uri.href),
          },
        ],
      }),
    )

    return server
  }
}
