import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const CLI_SKILL_MD = readFileSync(join(import.meta.dir, "../embedded/skills/cli/SKILL.md"), "utf-8")
const MCP_SKILL_MD = readFileSync(join(import.meta.dir, "../embedded/skills/mcp/SKILL.md"), "utf-8")

describe("embedded SKILL.md content", () => {
  test("CLI skill uses sandy resource command links", () => {
    expect(CLI_SKILL_MD).toContain("sandy resource sandy://skills/cli/resources/scripting-guide.md")
  })

  test("MCP skill uses direct sandy:// links", () => {
    expect(MCP_SKILL_MD).toContain("sandy://skills/mcp/resources/scripting-guide.md")
  })

  test("legacy src/mcp-resources directory is removed", () => {
    expect(existsSync(join(import.meta.dir, "./mcp-resources"))).toBe(false)
  })
})
