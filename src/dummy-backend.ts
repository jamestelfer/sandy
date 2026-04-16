import type { Backend } from "./backend"
import type { ProgressCallback, RunOptions, RunResult } from "./types"

type BackendCall =
  | { method: "imageCreate" }
  | { method: "imageDelete" }
  | { method: "imageExists" }
  | { method: "run"; opts: RunOptions }

export class DummyBackend implements Backend {
  calls: BackendCall[] = []
  imageExistsResult = false
  runResult: RunResult = { exitCode: 0, output: "", outputFiles: [] }
  progressLines: string[] = []

  async imageCreate(onProgress: ProgressCallback): Promise<void> {
    this.calls.push({ method: "imageCreate" })
    for (const line of this.progressLines) {
      onProgress(line)
    }
  }

  async imageDelete(onProgress: ProgressCallback): Promise<void> {
    this.calls.push({ method: "imageDelete" })
    for (const line of this.progressLines) {
      onProgress(line)
    }
  }

  async imageExists(_onProgress: ProgressCallback): Promise<boolean> {
    // imageExists is a silent probe — no progress output, matching real backends
    this.calls.push({ method: "imageExists" })
    return this.imageExistsResult
  }

  async run(opts: RunOptions, onProgress: ProgressCallback): Promise<RunResult> {
    this.calls.push({ method: "run", opts })
    for (const line of this.progressLines) {
      onProgress(line)
    }
    return { ...this.runResult }
  }
}
