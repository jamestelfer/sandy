import type { RunOptions, RunResult } from "../core/types"
import type { OutputHandler } from "../output/handler"
import type { Backend } from "../sandbox/backend"

type BackendCall =
  | { method: "imageCreate" }
  | { method: "imageDelete"; force: boolean }
  | { method: "imageExists" }
  | { method: "run"; opts: RunOptions }

export class DummyBackend implements Backend {
  calls: BackendCall[] = []
  imageExistsResult = false
  runResult: RunResult = { exitCode: 0, output: "", outputFiles: [] }
  progressLines: string[] = []
  stdoutLines: string[] = []

  async imageCreate(handler: OutputHandler): Promise<void> {
    this.calls.push({ method: "imageCreate" })
    for (const line of this.progressLines) {
      handler.stdoutLine(`[-->${line}`)
    }
  }

  async imageDelete(handler: OutputHandler, force = false): Promise<void> {
    this.calls.push({ method: "imageDelete", force })
    for (const line of this.progressLines) {
      handler.stdoutLine(`[-->${line}`)
    }
  }

  async imageExists(_handler: OutputHandler): Promise<boolean> {
    // imageExists is a silent probe — no progress output, matching real backends
    this.calls.push({ method: "imageExists" })
    return this.imageExistsResult
  }

  async run(opts: RunOptions, handler: OutputHandler): Promise<RunResult> {
    this.calls.push({ method: "run", opts })
    for (const line of this.progressLines) {
      handler.stdoutLine(`[-->${line}`)
    }
    for (const line of this.stdoutLines) {
      handler.stdoutLine(line)
    }
    return { ...this.runResult }
  }
}
