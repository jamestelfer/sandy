import { describe, expect, it } from "bun:test"
import { runPrime } from "./cli/prime"
import { runResource } from "./cli/resource"

describe("CLI prime", () => {
  it("prints CLI skill content", async () => {
    let output = ""
    await runPrime((line) => {
      output += line
    })

    expect(output).toContain("# Sandy")
    expect(output).toContain("sandy resource sandy://skills/cli/resources/scripting-guide.md")
  })
})

describe("CLI resource", () => {
  it("lists resources as JSON when URL is omitted", async () => {
    let output = ""
    await runResource({}, (line) => {
      output += line
    })

    const parsed = JSON.parse(output) as string[]
    expect(parsed.length).toBeGreaterThan(0)
    expect(parsed).toContain("sandy://skills/cli/SKILL.md")
    expect(parsed).toContain("sandy://skills/mcp/SKILL.md")
  })

  it("prints resource content when URL is provided", async () => {
    let output = ""
    await runResource({ url: "sandy://skills/cli/resources/scripting-guide.md" }, (line) => {
      output += line
    })

    expect(output).toContain("SANDY_OUTPUT")
  })

  it("throws on missing resource", async () => {
    await expect(runResource({ url: "sandy://skills/mcp/resources/missing.md" })).rejects.toThrow()
  })
})
