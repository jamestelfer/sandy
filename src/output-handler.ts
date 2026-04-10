import { parseProgressLine } from "./progress"
import type { ProgressCallback } from "./types"

export class OutputHandler {
  private outputBuf = ""

  constructor(
    private readonly onProgress: ProgressCallback,
    private readonly write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  ) {}

  stdoutLine(line: string): void {
    this.write(line)
    this.outputBuf += `${line}\n`
    const parsed = parseProgressLine(line)
    if (parsed.isProgress) {
      this.onProgress(parsed.message)
    }
  }

  stderrLine(line: string): void {
    const prefixed = `[err] ${line}`
    this.write(prefixed)
    this.outputBuf += `${prefixed}\n`
  }

  get output(): string {
    return this.outputBuf
  }
}
