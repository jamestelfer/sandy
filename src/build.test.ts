import { describe, test, expect } from "bun:test"
import packageJson from "../package.json"

describe("build:all script", () => {
  test("delegates to bunli", () => {
    const script = (packageJson.scripts as Record<string, string>)["build:all"]
    expect(script).toContain("bunli build")
  })
})
