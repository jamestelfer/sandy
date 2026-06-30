import { describe, expect, it } from "bun:test"
import { readEmbeddedResource } from "../../resources"
import { runPrime } from "./prime"
import { runResource } from "./resource"

async function collectPrime(): Promise<{ output: string; lines: string[] }> {
  let output = ""
  await runPrime((line) => {
    output += `${line}\n`
  })
  return { output, lines: output.split("\n") }
}

describe("CLI prime", () => {
  it("prints CLI skill content", async () => {
    let output = ""
    await runPrime((line) => {
      output += line
    })

    expect(output).toContain("# Sandy")
    expect(output).toContain("sandy resource sandy://skills/cli/resources/scripting-guide.md")
  })

  it("prints a header declaring the body line count before the body", async () => {
    const { output } = await collectPrime()
    const headerIndex = output.indexOf("=== SANDY PRIME")
    const bodyIndex = output.indexOf("# Sandy")

    expect(headerIndex).toBeGreaterThanOrEqual(0)
    expect(output).toMatch(/=== SANDY PRIME · lines=\d+ ===/)
    expect(headerIndex).toBeLessThan(bodyIndex)
  })

  it("prints a terminating sentinel as the final content line", async () => {
    const { lines } = await collectPrime()
    const nonEmpty = lines.filter((l) => l.trim().length > 0)
    const last = nonEmpty[nonEmpty.length - 1]

    expect(last).toMatch(/=== END-OF-PRIME · lines=\d+ ===/)
  })

  it("declares matching line counts in header and footer equal to the body length", async () => {
    const body = await readEmbeddedResource("sandy://skills/cli/SKILL.md")
    const expected = body.split("\n").length
    const { output } = await collectPrime()

    const header = output.match(/=== SANDY PRIME · lines=(\d+) ===/)
    const footer = output.match(/=== END-OF-PRIME · lines=(\d+) ===/)

    expect(header?.[1]).toBe(String(expected))
    expect(footer?.[1]).toBe(String(expected))
  })

  it("emits a read-completeness directive before and after the body", async () => {
    const { output } = await collectPrime()
    const bodyIndex = output.indexOf("# Sandy")
    const endIndex = output.indexOf("=== END-OF-PRIME")

    const before = output.slice(0, bodyIndex)
    const after = output.slice(bodyIndex, endIndex)

    expect(before).toMatch(/read .*full/i)
    expect(before).toMatch(/head|tail/i)
    expect(after).toMatch(/read .*full/i)
    expect(after).toMatch(/head|tail/i)
  })

  it("includes research mode resource URIs", async () => {
    let output = ""
    await runPrime((line) => {
      output += line
    })

    expect(output).toContain("sandy://skills/research/modes/firefight.md")
    expect(output).toContain("sandy://skills/research/modes/audit.md")
    expect(output).toContain("sandy://skills/research/modes/architect.md")
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
