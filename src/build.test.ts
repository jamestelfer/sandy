import { describe, test, expect } from "bun:test"
import packageJson from "../package.json"

describe("build:all script", () => {
  test("targets all four platforms", () => {
    const script = (packageJson.scripts as Record<string, string>)["build:all"]
    expect(script).toContain("bun-darwin-arm64")
    expect(script).toContain("bun-darwin-x64")
    expect(script).toContain("bun-linux-arm64")
    expect(script).toContain("bun-linux-x64")
  })
})
