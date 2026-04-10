import type { ProgressCallback, RunOptions, RunResult } from "./types"

export interface Backend {
  imageCreate(onProgress: ProgressCallback): Promise<void>
  imageDelete(onProgress: ProgressCallback): Promise<void>
  imageExists(onProgress: ProgressCallback): Promise<boolean>
  run(opts: RunOptions, onProgress: ProgressCallback): Promise<RunResult>
}
