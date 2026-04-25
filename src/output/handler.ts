import type { ProgressCallback } from "../core"
import { LineWriter } from "./line-writer"
import { parseProgressLine } from "./progress"

export class OutputHandler {
  private outputBuf = ""
  private _stdoutWriter?: LineWriter
  private _stderrWriter?: LineWriter

  constructor(
    private readonly onProgress: ProgressCallback,
    private readonly write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  ) {}

  get stdoutWriter(): LineWriter {
    if (!this._stdoutWriter) {
      this._stdoutWriter = new LineWriter((line) => this.stdoutLine(line))
    }
    return this._stdoutWriter
  }

  get stderrWriter(): LineWriter {
    if (!this._stderrWriter) {
      this._stderrWriter = new LineWriter((line) => this.stderrLine(line))
    }
    return this._stderrWriter
  }

  feedStdout(chunk: Buffer): void {
    this.stdoutWriter.feed(chunk)
  }

  feedStderr(chunk: Buffer): void {
    this.stderrWriter.feed(chunk)
  }

  flush(): void {
    this._stdoutWriter?.flush()
    this._stderrWriter?.flush()
  }

  stdoutLine(line: string): void {
    this.outputBuf += `${line}\n`
    const parsed = parseProgressLine(line)
    if (parsed.isProgress) {
      this.onProgress(parsed.message)
    } else {
      this.write(line)
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
