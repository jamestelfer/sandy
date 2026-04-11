import { readFileSync } from "node:fs"
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { Backend } from "./backend"
import { createSession } from "./session"
import type { RunOptions } from "./types"
import { DEFAULT_REGION } from "./types"

// Example scripts — embedded in binary by Bun at build time
import ec2DescribePath from "../isolate/skills/sandy/resources/examples/ec2_describe.ts" with {
  type: "file",
}
import ecsServicesPath from "../isolate/skills/sandy/resources/examples/ecs_services.ts" with {
  type: "file",
}
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol"

const EXAMPLES: Record<string, string> = {
  ec2_describe: readFileSync(ec2DescribePath, "utf-8"),
  ecs_services: readFileSync(ecsServicesPath, "utf-8"),
}

const SCRIPTING_GUIDE = `# Sandy Scripting Guide

Sandy runs TypeScript scripts in sandboxed microVMs with AWS SDK access via IMDS.

## Runtime environment

| Item | Detail |
|------|--------|
| Working directory | \`/workspace\` |
| Scripts mount | \`/workspace/scripts/\` (read-only) |
| Output mount | \`/workspace/output/\` (read-write) |
| Output env var | \`process.env.SANDY_OUTPUT\` → \`/workspace/output\` |
| Runtime | Node.js 24, pnpm, tsc (compiled JS executed by node) |

## Installed packages

- All \`@aws-sdk/client-*\` packages (ec2, ecs, ecr, s3, iam, lambda, cloudformation, ssm, secrets-manager, etc.)
- \`arquero\` — data table manipulation and aggregation
- \`asciichart\` — ASCII line charts for terminal output
- \`console-table-printer\` — table output
- \`@fast-csv/format\` — CSV generation
- \`jmespath\` — JSON query language

## AWS credentials

Credentials resolved via IMDS. No static credentials needed — obtain an IMDS port from the imds-broker MCP before running.

## Constraints

- **No child processes.** Node's permission model blocks \`child_process\`. Use SDK clients directly.
- **File system access is allowed.** Use \`process.env.SANDY_OUTPUT\` for output files.

## Mandatory: async generators for all AWS iteration

Every paginated AWS call MUST be an \`async function*\` generator. Do not accumulate results into arrays.

\`\`\`typescript
async function* listThings(client: SomeClient): AsyncGenerator<Thing[]> {
  let nextToken: string | undefined;
  do {
    const resp = await client.send(new ListThingsCommand({ NextToken: nextToken }));
    const items = resp.Things ?? [];
    if (items.length > 0) yield items;
    nextToken = resp.NextToken;
  } while (nextToken);
}

for await (const batch of listThings(client)) {
  // process batch
}
\`\`\`

## Other guidelines

- **Show progress** to stdout so the user can tell the script is alive.
- **Provide partial results on failure.** Wrap outer-loop iterations in try/catch.
- **Break logic into functions** — generators for iteration, pure functions for analysis.
`

export interface SandyRunParams {
  script: string
  imdsPort: number
  region?: string
  args?: string[]
}

export type ProgressCallback = (message: string) => void | Promise<void>

export interface SandyRunResult {
  exitCode: number
  output: string
  sessionName: string
}

interface ActiveSession {
  name: string
  dir: string
}

export const handlerProgressCallback = (
  handlerContext: RequestHandlerExtra<ServerRequest, ServerNotification>,
): ProgressCallback => {
  const token = handlerContext._meta?.progressToken
  if (token === undefined) {
    return async (message: string) => {}
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

  constructor(private backend: Backend) {}

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
  ): Promise<SandyRunResult> {
    const scriptPath = action === "baseline" ? "__baseline__" : "__connect__"
    const port = imdsPort ?? 0
    const session = await this.ensureSession()
    const opts: RunOptions = {
      scriptPath,
      imdsPort: port,
      region: DEFAULT_REGION,
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
    this.resumedName = sessionName
    // Dir will be created lazily on next sandy_run or sandy_check
    this.activeSession = null
  }

  async handleSandyRun(
    params: SandyRunParams,
    onProgress?: ProgressCallback,
  ): Promise<SandyRunResult> {
    const session = await this.ensureSession()

    const opts: RunOptions = {
      scriptPath: params.script,
      imdsPort: params.imdsPort,
      region: params.region ?? DEFAULT_REGION,
      session: session.name,
      sessionDir: session.dir,
      scriptArgs: params.args,
    }

    const result = await this.backend.run(opts, async (msg) => {
      await onProgress?.(msg)
    })

    return {
      exitCode: result.exitCode,
      output: result.output,
      sessionName: session.name,
    }
  }

  private async ensureSession(): Promise<ActiveSession> {
    if (!this.activeSession) {
      const session = await createSession(this.resumedName ?? undefined)
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
        }),
      },
      async ({ action, imdsPort }, ctx) => {
        const onProgress = handlerProgressCallback(ctx)
        const result = await this.handleSandyCheck(onProgress, action, imdsPort)
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
          region: z.string().optional().describe("AWS region (default: us-west-2)"),
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
        description: "Set the active session name without validation",
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
      list: undefined,
    })
    server.registerResource(
      "examples",
      exampleTemplate,
      { description: "Example Sandy scripts (ec2_describe, ecs_services)" },
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
