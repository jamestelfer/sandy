import { readFileSync } from "node:fs"
import { resolve, sep } from "node:path"
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { Backend } from "./backend"
import { createSession, validateSessionName } from "./session"
import type { ProgressCallback, RunOptions } from "./types"
import { DEFAULT_REGION } from "./types"

// Resources — embedded in binary by Bun at build time
import scriptingGuidePath from "./mcp-resources/scripting-guide.md" with { type: "file" }
import ec2DescribePath from "./mcp-resources/examples/ec2_describe.ts" with { type: "file" }
import ecsServicesPath from "./mcp-resources/examples/ecs_services.ts" with { type: "file" }
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol"

const SCRIPTING_GUIDE = readFileSync(scriptingGuidePath, "utf-8")
const EXAMPLES: Record<string, string> = {
  "ec2_describe.ts": readFileSync(ec2DescribePath, "utf-8"),
  "ecs_services.ts": readFileSync(ecsServicesPath, "utf-8"),
}

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

export class SandyMcpServer {
  private activeSession: ActiveSession | null = null
  private resumedName: string | null = null
  private readonly scriptsRoot: string

  constructor(
    private backend: Backend,
    scriptsRoot: string = process.cwd(),
  ) {
    this.scriptsRoot = scriptsRoot
  }

  private validateScriptPath(scriptPath: string): void {
    const resolved = resolve(scriptPath)
    if (!resolved.startsWith(this.scriptsRoot + sep)) {
      throw new Error(
        `script path must be within the working directory: ${JSON.stringify(scriptPath)}`,
      )
    }
  }

  // ── Resource handlers ────────────────────────────────────────────────────

  handleScriptingGuideResource(): string {
    return SCRIPTING_GUIDE
  }

  handleExampleResource(name: string): string {
    const content = EXAMPLES[name]
    if (!content) {
      throw new Error(`Unknown example: ${name}. Available: ${Object.keys(EXAMPLES).join(", ")}`)
    }
    return content
  }

  // ── Tool handlers ────────────────────────────────────────────────────────

  async handleSandyCheck(
    onProgress: ProgressCallback,
    action: "baseline" | "connect",
    imdsPort?: number,
    region?: string,
  ): Promise<SandyRunResult> {
    const imageExists = await this.backend.imageExists(onProgress)
    if (!imageExists) {
      return {
        exitCode: 1,
        output: "No image found. Use the sandy_image tool with action 'create' to build one first.",
        sessionName: "",
      }
    }
    const scriptPath = action === "baseline" ? "__baseline__" : "__connect__"
    const port = imdsPort ?? 0
    const session = await this.ensureSession()
    const opts: RunOptions = {
      scriptPath,
      imdsPort: port,
      region: region ?? DEFAULT_REGION,
      session: session.name,
      sessionDir: session.dir,
    }
    const result = await this.backend.run(opts, onProgress)
    return {
      exitCode: result.exitCode,
      output: result.output,
      sessionName: session.name,
    }
  }

  async handleSandyImage(onProgress: ProgressCallback, action: "create" | "delete"): Promise<void> {
    if (action === "create") {
      await this.backend.imageCreate(onProgress)
    } else {
      await this.backend.imageDelete(onProgress)
    }
  }

  handleResumeSession(sessionName: string): void {
    validateSessionName(sessionName)
    this.resumedName = sessionName
    // Dir will be created lazily on next sandy_run or sandy_check
    this.activeSession = null
  }

  async handleSandyRun(
    params: SandyRunParams,
    onProgress?: ProgressCallback,
  ): Promise<SandyRunResult> {
    this.validateScriptPath(params.script)
    const session = await this.ensureSession()

    const opts: RunOptions = {
      scriptPath: params.script,
      imdsPort: params.imdsPort,
      region: params.region ?? DEFAULT_REGION,
      session: session.name,
      sessionDir: session.dir,
      scriptArgs: params.args,
    }

    const result = await this.backend.run(opts, onProgress ?? (() => {}))

    return {
      exitCode: result.exitCode,
      output: result.output,
      sessionName: session.name,
    }
  }

  private async ensureSession(): Promise<ActiveSession> {
    if (!this.activeSession) {
      const session = await createSession(this.resumedName ?? undefined)
      this.resumedName = null
      this.activeSession = session
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
        }),
      },
      async ({ action }, ctx) => {
        const onProgress = handlerProgressCallback(ctx)
        await this.handleSandyImage(onProgress, action)
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

    server.registerResource(
      "scripting-guide",
      "sandy://scripting-guide",
      { description: "Sandy scripting conventions and available packages" },
      (_uri) => ({
        contents: [
          {
            uri: "sandy://scripting-guide",
            text: this.handleScriptingGuideResource(),
            mimeType: "text/markdown",
          },
        ],
      }),
    )

    const exampleTemplate = new ResourceTemplate("sandy://examples/{name}", {
      list: async () => ({
        resources: Object.keys(EXAMPLES).map((name) => ({
          uri: `sandy://examples/${name}`,
          name,
          description: `Example Sandy script: ${name}`,
          mimeType: "text/plain",
        })),
      }),
    })
    server.registerResource(
      "examples",
      exampleTemplate,
      { description: "Example Sandy scripts (ec2_describe.ts, ecs_services.ts)" },
      (uri, { name }) => ({
        contents: [
          {
            uri: uri.href,
            text: this.handleExampleResource(name as string),
            mimeType: "text/plain",
          },
        ],
      }),
    )

    return server
  }
}
