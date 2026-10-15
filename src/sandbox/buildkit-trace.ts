// Decoder for BuildKit progress carried in Docker Engine `/build?version=2`
// responses. Each `{"id":"moby.buildkit.trace","aux":"<base64>"}` message holds
// a protobuf `moby.buildkit.v1.StatusResponse` (buildkit api/services/control/
// control.proto). Only the fields needed for build output are read; a minimal
// wire-format reader avoids a protobuf dependency.
//
//   StatusResponse { repeated Vertex vertexes = 1; repeated VertexLog logs = 3; }
//   Vertex         { string digest = 1; string name = 3; bool cached = 4;
//                    Timestamp started = 5; Timestamp completed = 6; string error = 7; }
//   VertexLog      { string vertex = 1; int64 stream = 3; bytes msg = 4; }

export interface TraceVertex {
  digest: string
  name: string
  cached: boolean
  started: boolean
  completed: boolean
  error?: string
}

export interface TraceLog {
  vertex: string
  stream: number
  data: Uint8Array
}

export interface TraceStatus {
  vertexes: TraceVertex[]
  logs: TraceLog[]
}

const WIRE_VARINT = 0
const WIRE_I64 = 1
const WIRE_LEN = 2
const WIRE_I32 = 5

interface Field {
  no: number
  value: bigint | Uint8Array
}

function* readFields(buf: Uint8Array): Generator<Field> {
  let pos = 0
  const varint = (): bigint => {
    let result = 0n
    let shift = 0n
    for (;;) {
      const byte = buf[pos++]
      if (byte === undefined) {
        throw new Error("buildkit trace: truncated varint")
      }
      result |= BigInt(byte & 0x7f) << shift
      if (byte < 0x80) {
        return result
      }
      shift += 7n
    }
  }

  while (pos < buf.length) {
    const key = Number(varint())
    const no = key >>> 3
    const wire = key & 7
    switch (wire) {
      case WIRE_VARINT:
        yield { no, value: varint() }
        break
      case WIRE_LEN: {
        const len = Number(varint())
        if (pos + len > buf.length) {
          throw new Error("buildkit trace: truncated field")
        }
        yield { no, value: buf.subarray(pos, pos + len) }
        pos += len
        break
      }
      case WIRE_I64:
        pos += 8
        break
      case WIRE_I32:
        pos += 4
        break
      default:
        throw new Error(`buildkit trace: unsupported wire type ${wire}`)
    }
  }
}

const utf8 = new TextDecoder()

function decodeVertex(buf: Uint8Array): TraceVertex {
  const vertex: TraceVertex = {
    digest: "",
    name: "",
    cached: false,
    started: false,
    completed: false,
  }
  for (const { no, value } of readFields(buf)) {
    if (no === 1 && value instanceof Uint8Array) {
      vertex.digest = utf8.decode(value)
    } else if (no === 3 && value instanceof Uint8Array) {
      vertex.name = utf8.decode(value)
    } else if (no === 4 && typeof value === "bigint") {
      vertex.cached = value !== 0n
    } else if (no === 5) {
      vertex.started = true
    } else if (no === 6) {
      vertex.completed = true
    } else if (no === 7 && value instanceof Uint8Array) {
      vertex.error = utf8.decode(value)
    }
  }
  return vertex
}

function decodeLog(buf: Uint8Array): TraceLog {
  const log: TraceLog = { vertex: "", stream: 1, data: new Uint8Array() }
  for (const { no, value } of readFields(buf)) {
    if (no === 1 && value instanceof Uint8Array) {
      log.vertex = utf8.decode(value)
    } else if (no === 3 && typeof value === "bigint") {
      log.stream = Number(value)
    } else if (no === 4 && value instanceof Uint8Array) {
      log.data = value
    }
  }
  return log
}

/** Decodes one base64 `aux` payload from a `moby.buildkit.trace` message. */
export function decodeTrace(aux: string): TraceStatus {
  const status: TraceStatus = { vertexes: [], logs: [] }
  for (const { no, value } of readFields(Buffer.from(aux, "base64"))) {
    if (!(value instanceof Uint8Array)) {
      continue
    }
    if (no === 1) {
      status.vertexes.push(decodeVertex(value))
    } else if (no === 3) {
      status.logs.push(decodeLog(value))
    }
  }
  return status
}
