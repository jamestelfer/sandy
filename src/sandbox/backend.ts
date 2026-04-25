import type { RunOptions, RunResult } from "../core/types"
import type { OutputHandler } from "../output/handler"

export interface Backend {
  imageCreate(handler: OutputHandler): Promise<void>
  imageDelete(handler: OutputHandler, force?: boolean): Promise<void>
  imageExists(handler: OutputHandler): Promise<boolean>
  run(opts: RunOptions, handler: OutputHandler): Promise<RunResult>
}
