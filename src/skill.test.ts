import { describe, test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SKILL_MD = readFileSync(join(import.meta.dir, "../plugin/skills/sandy/SKILL.md"), "utf-8")

describe("SKILL.md", () => {
  test("references sandy://scripting-guide resource", () => {
    expect(SKILL_MD).toContain("sandy://scripting-guide")
  })

  test("references sandy://examples/ resource pattern", () => {
    expect(SKILL_MD).toContain("sandy://examples/")
  })
})
