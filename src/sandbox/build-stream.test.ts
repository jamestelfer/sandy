import { describe, expect, test } from "bun:test"
import { Readable } from "node:stream"
import { OutputHandler } from "../output"
import { traceLine } from "../test-support"
import { consumeBuildStream, readJsonLines } from "./build-stream"

function capture() {
  const lines: string[] = []
  const progress: string[] = []
  const handler = new OutputHandler(
    (msg) => {
      progress.push(msg)
    },
    (line) => {
      lines.push(line)
    },
  )
  return { handler, lines, progress }
}

const chunks = (...parts: string[]) => Readable.from(parts.map((p) => Buffer.from(p)))

describe("readJsonLines", () => {
  test("reassembles JSON lines split across chunks", async () => {
    const line = JSON.stringify({ id: "x", aux: "a".repeat(100) })
    const msgs: unknown[] = []
    await readJsonLines(chunks(line.slice(0, 30), line.slice(30, 70), `${line.slice(70)}\n`), (m) =>
      msgs.push(m),
    )
    expect(msgs).toEqual([{ id: "x", aux: "a".repeat(100) }])
  })

  test("parses a final line without a trailing newline", async () => {
    const msgs: unknown[] = []
    await readJsonLines(chunks('{"a":1}\n{"b":2}'), (m) => msgs.push(m))
    expect(msgs).toEqual([{ a: 1 }, { b: 2 }])
  })

  test("ignores non-JSON lines", async () => {
    const msgs: unknown[] = []
    await readJsonLines(chunks('not json\n{"a":1}\n'), (m) => msgs.push(m))
    expect(msgs).toEqual([{ a: 1 }])
  })

  test("rejects with the handler error and stops processing", async () => {
    const msgs: unknown[] = []
    const run = readJsonLines(chunks('{"a":1}\n{"bad":true}\n{"c":3}\n'), (m) => {
      if ("bad" in m) {
        throw new Error("boom")
      }
      msgs.push(m)
    })
    await expect(run).rejects.toThrow("boom")
    expect(msgs).toEqual([{ a: 1 }])
  })
})

describe("consumeBuildStream", () => {
  test("passes classic builder stream text through and forwards progress", async () => {
    const { handler, lines, progress } = capture()
    await consumeBuildStream(
      chunks(`${JSON.stringify({ stream: "Step 1/2 : FROM x\n[--> install deps\n" })}\n`),
      handler,
    )
    expect(lines).toEqual(["Step 1/2 : FROM x"])
    expect(progress).toEqual(["install deps"])
  })

  test("renders BuildKit steps once and routes step output", async () => {
    const { handler, lines, progress } = capture()
    const run = { digest: "sha256:run", name: "[stage-0 2/2] RUN sh init.sh" }
    await consumeBuildStream(
      chunks(
        traceLine({ vertexes: [{ ...run, started: false }] }),
        traceLine({ vertexes: [run] }),
        traceLine({ logs: [{ vertex: run.digest, msg: "[--> install deps\nfirst " }] }),
        traceLine({ logs: [{ vertex: run.digest, stream: 2, msg: "line\n" }] }),
        traceLine({ vertexes: [{ ...run, completed: true }] }),
      ),
      handler,
    )
    expect(lines).toEqual(["#1 [stage-0 2/2] RUN sh init.sh", "first line"])
    expect(progress).toEqual(["install deps"])
  })

  test("skips internal vertices and reports cached and failed steps", async () => {
    const { handler, lines } = capture()
    const run = consumeBuildStream(
      chunks(
        traceLine({ vertexes: [{ digest: "sha256:i", name: "[internal] load build definition" }] }),
        traceLine({
          vertexes: [
            { digest: "sha256:a", name: "[1/2] FROM node", cached: true, completed: true },
          ],
        }),
        traceLine({
          vertexes: [{ digest: "sha256:b", name: "[2/2] RUN false", error: "exit code: 1" }],
        }),
        `${JSON.stringify({ error: "process did not complete successfully: exit code: 1" })}\n`,
      ),
      handler,
    )
    await expect(run).rejects.toThrow("docker build: process did not complete successfully")
    expect(lines).toEqual([
      "#1 [1/2] FROM node",
      "#1 CACHED",
      "#2 [2/2] RUN false",
      "#2 ERROR: exit code: 1",
    ])
  })

  test("returns the image ID reported by BuildKit", async () => {
    const { handler } = capture()
    const result = await consumeBuildStream(
      chunks(`${JSON.stringify({ id: "moby.image.id", aux: { ID: "sha256:abc" } })}\n`),
      handler,
    )
    expect(result).toEqual({ imageId: "sha256:abc" })
  })

  test("does not forward progress after an error frame", async () => {
    const { handler, progress } = capture()
    const run = consumeBuildStream(
      chunks(
        `${JSON.stringify({ error: "build failed" })}\n${JSON.stringify({ stream: "[--> after\n" })}\n`,
      ),
      handler,
    )
    await expect(run).rejects.toThrow("build failed")
    expect(progress).toEqual([])
  })
})
