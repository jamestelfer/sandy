import { Writable } from "node:stream"

export class LineWriter extends Writable {
  private remainder = ""

  constructor(private readonly onLine: (line: string) => void) {
    super()
  }

  feed(chunk: Buffer): void {
    const text = this.remainder + chunk.toString()
    const lines = text.split("\n")
    this.remainder = lines.pop() ?? ""
    for (const raw of lines) {
      const line = raw.trimEnd()
      if (line) {
        this.onLine(line)
      }
    }
  }

  flush(): void {
    const line = this.remainder.trimEnd()
    if (line) {
      this.onLine(line)
    }
    this.remainder = ""
  }

  _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.feed(chunk)
    cb()
  }

  _final(cb: () => void): void {
    this.flush()
    cb()
  }
}
