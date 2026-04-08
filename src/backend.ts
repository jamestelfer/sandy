import type { RunOptions, RunResult } from "./types"

export interface Backend {
  imageCreate(): Promise<void>
  imageDelete(): Promise<void>
  imageExists(): Promise<boolean>
  run(opts: RunOptions, onProgress: (message: string) => void): Promise<RunResult>
}
