import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(import.meta.dir, "..")

const requiredFiles = [
  "embedded/skills/cli/SKILL.md",
  "embedded/skills/cli/resources/scripting-guide.md",
  "embedded/skills/cli/resources/examples/ec2_describe.ts",
  "embedded/skills/cli/resources/examples/ecs_services.ts",
  "embedded/skills/mcp/SKILL.md",
  "embedded/skills/mcp/resources/scripting-guide.md",
  "embedded/skills/mcp/resources/examples/ec2_describe.ts",
  "embedded/skills/mcp/resources/examples/ecs_services.ts",
  "embedded/bootstrap/init.sh",
  "embedded/bootstrap/node_certs.sh",
  "embedded/bootstrap/package.json",
  "embedded/bootstrap/tsconfig.json",
  "embedded/bootstrap/entrypoint",
  "embedded/bootstrap/sandy.ts",
  "embedded/checks/baseline.ts",
  "embedded/checks/connect.ts",
]

describe("embedded content layout", () => {
  test("contains required CLI and MCP files", () => {
    for (const relativePath of requiredFiles) {
      expect(existsSync(join(repoRoot, relativePath))).toBe(true)
    }
  })

  test("MCP scripting guide migrated from legacy resources", () => {
    const content = readFileSync(
      join(repoRoot, "embedded/skills/mcp/resources/scripting-guide.md"),
      "utf-8",
    )

    expect(content).toContain("SANDY_OUTPUT")
    expect(content).toContain("async function*")
  })

  test("bootstrap files are present under embedded/bootstrap", () => {
    const bootstrapFiles = [
      "init.sh",
      "node_certs.sh",
      "package.json",
      "tsconfig.json",
      "entrypoint",
      "sandy.ts",
    ]
    for (const name of bootstrapFiles) {
      expect(existsSync(join(repoRoot, "embedded/bootstrap", name))).toBe(true)
    }
  })

  test("check scripts are present under embedded/checks", () => {
    expect(existsSync(join(repoRoot, "embedded/checks/baseline.ts"))).toBe(true)
    expect(existsSync(join(repoRoot, "embedded/checks/connect.ts"))).toBe(true)
  })
})
