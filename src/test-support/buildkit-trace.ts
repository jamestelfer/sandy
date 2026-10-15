// Minimal protobuf encoder for BuildKit `StatusResponse` trace payloads, used to
// build `moby.buildkit.trace` messages in tests. Mirrors the fields read by
// src/sandbox/buildkit-trace.ts.

function varint(n: number): number[] {
  const out: number[] = []
  let v = n
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  out.push(v)
  return out
}

export function pbBytes(no: number, bytes: Uint8Array | string | number[]): number[] {
  const b =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : bytes instanceof Uint8Array
        ? bytes
        : Uint8Array.from(bytes)
  return [...varint((no << 3) | 2), ...varint(b.length), ...b]
}

export function pbVarint(no: number, n: number): number[] {
  return [...varint(no << 3), ...varint(n)]
}

export interface FakeVertex {
  digest: string
  name: string
  cached?: boolean
  started?: boolean
  completed?: boolean
  error?: string
}

export interface FakeLog {
  vertex: string
  stream?: number
  msg: string
}

// Timestamp contents are irrelevant to the decoder; presence is what matters.
const TIMESTAMP = pbVarint(1, 1)

export function encodeTrace(status: { vertexes?: FakeVertex[]; logs?: FakeLog[] }): string {
  const out: number[] = []
  for (const v of status.vertexes ?? []) {
    const fields = [...pbBytes(1, v.digest), ...pbBytes(3, v.name)]
    if (v.cached) {
      fields.push(...pbVarint(4, 1))
    }
    if (v.started ?? true) {
      fields.push(...pbBytes(5, TIMESTAMP))
    }
    if (v.completed) {
      fields.push(...pbBytes(6, TIMESTAMP))
    }
    if (v.error) {
      fields.push(...pbBytes(7, v.error))
    }
    out.push(...pbBytes(1, fields))
  }
  for (const l of status.logs ?? []) {
    out.push(
      ...pbBytes(3, [...pbBytes(1, l.vertex), ...pbVarint(3, l.stream ?? 1), ...pbBytes(4, l.msg)]),
    )
  }
  return Buffer.from(out).toString("base64")
}

/** One `moby.buildkit.trace` JSON line, as streamed by `/build?version=2`. */
export function traceLine(status: { vertexes?: FakeVertex[]; logs?: FakeLog[] }): string {
  return `${JSON.stringify({ id: "moby.buildkit.trace", aux: encodeTrace(status) })}\n`
}
