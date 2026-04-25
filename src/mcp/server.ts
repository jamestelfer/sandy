import { join } from "node:path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol"
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types"
import { DEFAULT_REGION, type ProgressCallback, type RunOptions } from "../core"
import { type Logger, noopLogger } from "../logging"
import { OutputHandler } from "../output"
import { extractEmbeddedChecks, listEmbeddedResourceUris, readEmbeddedResource } from "../resources"
import type { Backend } from "../sandbox"
import { Session } from "../session"
import { registerMcpResources } from "./resources"
import { registerMcpTools } from "./tools"

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

    registerMcpTools(server, {
      logger: this.logger,
      progressFromContext: handlerProgressCallback,
      handleSandyImage: (onProgress, action, force) =>
        this.handleSandyImage(onProgress, action, force),
      handleSandyCheck: (onProgress, action, imdsPort, region) =>
        this.handleSandyCheck(onProgress, action, imdsPort, region),
      handleSandyRun: (params, onProgress) => this.handleSandyRun(params, onProgress),
      handleCreateSession: () => this.handleCreateSession(),
      handleResumeSession: (sessionName) => this.handleResumeSession(sessionName),
      handlePrime: () => this.handlePrime(),
    })

    registerMcpResources(server, {
      listEmbeddedResourceUris,
      readEmbeddedResource,
    })

    return server
  }
}
