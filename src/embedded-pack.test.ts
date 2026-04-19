import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join } from "node:path"

const repoRoot = join(import.meta.dir, "..")
const packageJsonPath = join(repoRoot, "package.json")

describe("embedded pack step", () => {
  test("has prebuild hook for pack script", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.prebuild).toContain("scripts/pack-embedded.ts")
  })

  test("pack script creates embedded.tar containing skill roots", () => {
    const scriptPath = join(repoRoot, "scripts/pack-embedded.ts")
    const tarPath = join(repoRoot, "embedded.tar")

    expect(existsSync(scriptPath)).toBe(true)

    execSync("bun scripts/pack-embedded.ts", { cwd: repoRoot, stdio: "pipe" })

    expect(existsSync(tarPath)).toBe(true)

    const listing = execSync("tar -tf embedded.tar", { cwd: repoRoot, encoding: "utf-8" })
    expect(listing).toContain("skills/cli/SKILL.md")
    expect(listing).toContain("skills/mcp/SKILL.md")
  })
})
