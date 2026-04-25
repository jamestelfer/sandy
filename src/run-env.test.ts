import { describe, expect, test } from "bun:test"
import { DEFAULT_REGION, type RunOptions, VM_OUTPUT_DIR } from "./core"
import { buildRunEnv } from "./execution"

const baseOpts: RunOptions = {
  scriptPath: "/scripts/hello.ts",
  imdsPort: 9001,
  session: "s1",
  sessionDir: "/tmp/s1",
}

describe("buildRunEnv", () => {
  test("sets IMDS endpoint to the provided value", () => {
    const env = buildRunEnv(baseOpts, "http://10.0.0.1:9001")
    expect(env.AWS_EC2_METADATA_SERVICE_ENDPOINT).toBe("http://10.0.0.1:9001")
  })

  test("sets endpoint mode to IPv4", () => {
    const env = buildRunEnv(baseOpts, "http://10.0.0.1:9001")
    expect(env.AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE).toBe("IPv4")
  })

  test("disables IMDSv1", () => {
    const env = buildRunEnv(baseOpts, "http://10.0.0.1:9001")
    expect(env.AWS_EC2_METADATA_V1_DISABLED).toBe("true")
  })

  test("uses opts.region when provided", () => {
    const env = buildRunEnv({ ...baseOpts, region: "eu-west-1" }, "http://x:1")
    expect(env.AWS_REGION).toBe("eu-west-1")
  })

  test("falls back to DEFAULT_REGION when region is undefined", () => {
    const env = buildRunEnv({ ...baseOpts, region: undefined }, "http://x:1")
    expect(env.AWS_REGION).toBe(DEFAULT_REGION)
  })

  test("sets SANDY_OUTPUT to VM_OUTPUT_DIR", () => {
    const env = buildRunEnv(baseOpts, "http://x:1")
    expect(env.SANDY_OUTPUT).toBe(VM_OUTPUT_DIR)
  })
})
