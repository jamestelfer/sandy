import { describe, expect, test } from "bun:test"
import { pbBytes as len, pbVarint as num } from "../test-support/buildkit-trace"
import { decodeTrace } from "./buildkit-trace"

// Payloads captured from Docker 28.0.0 `/build?version=2` for:
//   RUN --mount=type=cache,target=/c echo "[--> hello from run" && echo second line && ls /c
const CAPTURED_VERTEX_STARTED =
  "CocCCkdzaGEyNTY6ODFjMTRhMjg3NDFlYjVmNTg0YTgxOTgwMWZkMzA3MDNhODI2ODFkYjY0YWViYzBlODc4M2NiZTdkM2FlNzNhORJHc2hhMjU2OjZmYzUzM2ZkOThlMjEwMzkyODEyZGJkOWYxZTM2M2U5ZDRjM2E4NzdmYjQ3Yzg4MDhhNWViNzY2ZDY1YjZlNDcaZltzdGFnZS0wIDIvMl0gUlVOIC0tbW91bnQ9dHlwZT1jYWNoZSx0YXJnZXQ9L2MgZWNobyAiWy0tPiBoZWxsbyBmcm9tIHJ1biIgJiYgZWNobyBzZWNvbmQgbGluZSAmJiBscyAvYyoLCMnkvdYGELDPwGw="
const CAPTURED_LOG =
  "GnsKR3NoYTI1Njo4MWMxNGEyODc0MWViNWY1ODRhODE5ODAxZmQzMDcwM2E4MjY4MWRiNjRhZWJjMGU4NzgzY2JlN2QzYWU3M2E5EgwIyeS91gYQmsbNtAMYASIgWy0tPiBoZWxsbyBmcm9tIHJ1bgpzZWNvbmQgbGluZQo="
const RUN_DIGEST = "sha256:81c14a28741eb5f584a819801fd30703a82681db64aebc0e8783cbe7d3ae73a9"

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64")

describe("decodeTrace", () => {
  test("decodes a captured vertex start", () => {
    const status = decodeTrace(CAPTURED_VERTEX_STARTED)
    expect(status.logs).toEqual([])
    expect(status.vertexes).toEqual([
      {
        digest: RUN_DIGEST,
        name: '[stage-0 2/2] RUN --mount=type=cache,target=/c echo "[--> hello from run" && echo second line && ls /c',
        cached: false,
        started: true,
        completed: false,
      },
    ])
  })

  test("decodes a captured stdout log", () => {
    const status = decodeTrace(CAPTURED_LOG)
    expect(status.vertexes).toEqual([])
    expect(status.logs).toHaveLength(1)
    expect(status.logs[0]?.vertex).toBe(RUN_DIGEST)
    expect(status.logs[0]?.stream).toBe(1)
    expect(new TextDecoder().decode(status.logs[0]?.data)).toBe(
      "[--> hello from run\nsecond line\n",
    )
  })

  test("decodes vertex error and cached flag", () => {
    const vertex = [
      ...len(1, "sha256:abc"),
      ...len(3, "RUN false"),
      ...num(4, 1),
      ...len(7, "exit code: 1"),
    ]
    const status = decodeTrace(b64(len(1, vertex)))
    expect(status.vertexes).toEqual([
      {
        digest: "sha256:abc",
        name: "RUN false",
        cached: true,
        started: false,
        completed: false,
        error: "exit code: 1",
      },
    ])
  })

  test("decodes stderr logs and skips unrelated fields", () => {
    const log = [...len(1, "sha256:abc"), ...num(3, 2), ...len(4, "oops\n")]
    // Field 2 (statuses) and 4 (warnings) are ignored.
    const payload = [...len(2, "ignored"), ...len(3, log), ...len(4, "ignored")]
    const status = decodeTrace(b64(payload))
    expect(status.vertexes).toEqual([])
    expect(status.logs.map((l) => [l.vertex, l.stream, new TextDecoder().decode(l.data)])).toEqual([
      ["sha256:abc", 2, "oops\n"],
    ])
  })

  test("rejects truncated payloads", () => {
    const truncated = len(3, [1, 2, 3]).slice(0, -1)
    expect(() => decodeTrace(b64(truncated))).toThrow("truncated")
  })
})
