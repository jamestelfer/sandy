import type { RunOptions, RunResult } from "../core"
import type { OutputHandler } from "../output"

export interface Backend {
  imageCreate(handler: OutputHandler): Promise<void>
  imageDelete(handler: OutputHandler, force?: boolean): Promise<void>
  imageExists(handler: OutputHandler): Promise<boolean>
  run(opts: RunOptions, handler: OutputHandler): Promise<RunResult>
}
