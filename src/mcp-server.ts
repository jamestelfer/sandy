import type { Backend } from "./backend"
import { createSession } from "./session"
import type { RunOptions } from "./types"
import { DEFAULT_REGION } from "./types"

export interface SandyRunParams {
  script: string
  imdsPort: number
  region?: string
  args?: string[]
}

export interface SandyRunResult {
  exitCode: number
  stdout: string
  stderr: string
  sessionName: string
}

export class SandyMcpServer {
  private activeSessionName: string | null = null
  private activeSessionDir: string | null = null

  constructor(private backend: Backend) {}

  async handleSandyImage(action: "create" | "delete"): Promise<void> {
    if (action === "create") {
      await this.backend.imageCreate()
    } else {
      await this.backend.imageDelete()
    }
  }

  handleResumeSession(sessionName: string): void {
    this.activeSessionName = sessionName
    // Dir will be created lazily on next sandy_run
    this.activeSessionDir = null
  }

  async handleSandyRun(
    params: SandyRunParams,
    onProgress?: (message: string) => void,
  ): Promise<SandyRunResult> {
    if (!this.activeSessionDir) {
      const session = await createSession(this.activeSessionName ?? undefined)
      this.activeSessionName = session.name
      this.activeSessionDir = session.dir
    }

    const opts: RunOptions = {
      scriptPath: params.script,
      imdsPort: params.imdsPort,
      region: params.region ?? DEFAULT_REGION,
      session: this.activeSessionName,
      sessionDir: this.activeSessionDir,
      scriptArgs: params.args,
    }

    const result = await this.backend.run(opts, (msg) => onProgress?.(msg))

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      sessionName: this.activeSessionName,
    }
  }
}
