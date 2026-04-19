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

describe("skill sync contract", () => {
  const canonicalPath = join(import.meta.dir, "../embedded/skills/mcp/SKILL.md")
  const pluginPath = join(import.meta.dir, "../plugin/skills/sandy/SKILL.md")

  test("embedded MCP skill and plugin skill have identical content", () => {
    const canonical = readFileSync(canonicalPath, "utf-8")
    const plugin = readFileSync(pluginPath, "utf-8")
    expect(canonical).toBe(plugin)
  })

  test("canonical skill is embedded/skills/mcp/SKILL.md", () => {
    expect(existsSync(canonicalPath)).toBe(true)
  })
})
