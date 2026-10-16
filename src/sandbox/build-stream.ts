import type { OutputHandler } from "../output"
import { decodeTrace } from "./buildkit-trace"

// Docker Engine streams build and pull responses as newline-delimited JSON.
// Chunks do not align with lines (BuildKit trace payloads are long), so lines
// are buffered until complete before parsing.
export async function readJsonLines(
  stream: NodeJS.ReadableStream,
  onMessage: (msg: Record<string, unknown>) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let pending = ""
    let failed = false
    const fail = (error: unknown) => {
      failed = true
      stream.off("data", onData)
      reject(error)
    }
    const handleLine = (line: string) => {
      if (!line.trim()) {
        return
      }
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        return // non-JSON line, ignore
      }
      onMessage(msg)
    }
    const onData = (chunk: Buffer | string) => {
      pending += chunk.toString()
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      try {
        for (const line of lines) {
          handleLine(line)
        }
      } catch (error) {
        fail(error)
      }
    }
    stream.on("data", onData)
    stream.on("end", () => {
      if (failed) {
        return
      }
      try {
        handleLine(pending)
        resolve()
      } catch (error) {
        fail(error)
      }
    })
    stream.on("error", (error) => {
      if (!failed) {
        fail(error)
      }
    })
  })
}

export interface BuildResult {
  /** Image ID reported by BuildKit (`moby.image.id`); undefined for the classic builder. */
  imageId?: string
}

// Renders BuildKit vertices as plain-progress style lines (`#N name`, `#N CACHED`,
// `#N ERROR: …`) and routes step output through the handler so `[-->` progress
// markers keep working. Classic builder `stream` messages pass straight through.
export async function consumeBuildStream(
  stream: NodeJS.ReadableStream,
  handler: OutputHandler,
): Promise<BuildResult> {
  const result: BuildResult = {}
  const steps = new Map<string, { n: number; cached: boolean; errored: boolean }>()
  const out = (text: string) => handler.feedStdout(Buffer.from(text))

  // Flush in finally so a partial final line (often the failure diagnostic)
  // is emitted even when an error frame ends the build.
  try {
    await readJsonLines(stream, (msg) => {
      if (typeof msg.error === "string") {
        throw new Error(`docker build: ${msg.error.trim()}`)
      }
      if (typeof msg.stream === "string") {
        out(msg.stream)
        return
      }
      if (msg.id === "moby.image.id") {
        const id = (msg.aux as { ID?: unknown } | undefined)?.ID
        if (typeof id === "string") {
          result.imageId = id
        }
        return
      }
      if (msg.id !== "moby.buildkit.trace" || typeof msg.aux !== "string") {
        return
      }
      const status = decodeTrace(msg.aux)
      for (const v of status.vertexes) {
        if (!v.started || v.name.startsWith("[internal]")) {
          continue
        }
        let step = steps.get(v.digest)
        if (!step) {
          step = { n: steps.size + 1, cached: false, errored: false }
          steps.set(v.digest, step)
          out(`#${step.n} ${v.name}\n`)
        }
        if (v.cached && !step.cached) {
          step.cached = true
          out(`#${step.n} CACHED\n`)
        }
        if (v.error && !step.errored) {
          step.errored = true
          out(`#${step.n} ERROR: ${v.error}\n`)
        }
      }
      for (const log of status.logs) {
        handler.feedStdout(Buffer.from(log.data))
      }
    })
  } finally {
    handler.flush()
  }
  return result
}
