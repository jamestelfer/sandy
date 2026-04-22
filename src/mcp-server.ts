import { resolve, sep } from "node:path"
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { Backend } from "./backend"
import { OutputHandler } from "./output-handler"
import { createSession, validateSessionName } from "./session"
import { extractBuiltinChecks } from "./check-scripts"
import type { ProgressCallback, RunOptions } from "./types"
import { DEFAULT_REGION } from "./types"
import type { Logger } from "./logger"
import { noopLogger } from "./logger"
import { listEmbeddedResourceUris, readEmbeddedResource } from "./embedded-fs"
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol"

export interface SandyRunParams {
  script: string
  imdsPort: number
  region?: string
  args?: string[]
}

export interface SandyRunResult {
  exitCode: number
  output: string
  sessionName: string
}

interface ActiveSession {
  name: string
  dir: string
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
  private activeSession: ActiveSession | null = null
  private resumedName: string | null = null
  private readonly scriptsRoot: string

  constructor(
    private backend: Backend,
    scriptsRoot: string = process.cwd(),
    private readonly logger: Logger = noopLogger(),
  ) {
    this.scriptsRoot = scriptsRoot
  }

  private validateScriptPath(scriptPath: string): string {
    const resolved = resolve(this.scriptsRoot, scriptPath)
    if (!resolved.startsWith(this.scriptsRoot + sep)) {
      throw new Error(
        `script path must be within the working directory: ${JSON.stringify(scriptPath)}`,
      )
    }
    return resolved
  }

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
  ): Promise<SandyRunResult> {
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
          sessionName: "",
        }
      }
      const checkScript = action === "baseline" ? "baseline" : "connect"
      const port = imdsPort ?? 0
      await using checkDir = await extractBuiltinChecks()
      const scriptPath = `${checkDir.path}/${checkScript}.ts`
      const session = await this.ensureSession()
      const opts: RunOptions = {
        scriptPath,
        imdsPort: port,
        region: region ?? DEFAULT_REGION,
        session: session.name,
        sessionDir: session.dir,
      }
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

  handleResumeSession(sessionName: string): void {
    validateSessionName(sessionName)
    this.logger.info({ session: sessionName }, "session resume requested")
    this.resumedName = sessionName
    // Dir will be created lazily on next sandy_run or sandy_check
    this.activeSession = null
  }

  async handleSandyRun(
    params: SandyRunParams,
    onProgress?: ProgressCallback,
  ): Promise<SandyRunResult> {
    const log = this.logger.child({ tool: "sandy_run" })

    try {
      log.info({ script: params.script, region: params.region }, "invoked")

      const scriptPath = this.validateScriptPath(params.script)
      const session = await this.ensureSession()

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

  private async ensureSession(): Promise<ActiveSession> {
    if (!this.activeSession) {
      const resumed = this.resumedName !== null
      const session = await createSession(this.resumedName ?? undefined)
      this.resumedName = null
      this.activeSession = session
      this.logger.info({ session: session.name, resumed }, "session created")
    }
    return this.activeSession
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
        description: "Run a health check (baseline or connect)",
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
          script: z.string().describe("Path to the TypeScript script"),
          imdsPort: z.number().describe("IMDS server port on the host"),
          region: regionSchema.describe("AWS region (default: us-west-2)"),
          args: z.array(z.string()).optional().describe("Arguments passed to the script"),
        }),
      },
      async ({ script, imdsPort, region, args }, ctx) => {
        const onProgress = handlerProgressCallback(ctx)

        const result = await this.handleSandyRun({ script, imdsPort, region, args }, onProgress)

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        }
      },
    )

    server.registerTool(
      "sandy_resume_session",
      {
        description: "Set the active session name to resume a previous session",
        inputSchema: z.object({
          sessionName: z.string().describe("Session name to resume"),
        }),
      },
      async ({ sessionName }) => {
        this.logger.info({ tool: "sandy_resume_session", session: sessionName }, "invoked")
        this.handleResumeSession(sessionName)
        return {
          content: [
            {
              type: "text" as const,
              text: `Active session set to: ${sessionName}`,
            },
          ],
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
