import type { RunOptions, RunResult } from "../core"
import type { OutputHandler } from "../output"

export interface ImageInfo {
  /** Sandy version that built the image; undefined for images built before it was recorded. */
  sandyVersion?: string
  created?: Date
}

export interface Backend {
  imageCreate(handler: OutputHandler): Promise<void>
  imageDelete(handler: OutputHandler, force?: boolean): Promise<void>
  imageExists(handler: OutputHandler): Promise<boolean>
  /** Resolves undefined when no image exists. */
  imageInfo?(handler: OutputHandler): Promise<ImageInfo | undefined>
  run(opts: RunOptions, handler: OutputHandler): Promise<RunResult>
  /** Human-readable description of the backend's endpoint, when it has one. */
  describe?(): string | undefined
}
