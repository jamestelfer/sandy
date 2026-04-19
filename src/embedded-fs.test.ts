import { describe, expect, test } from "bun:test"
import {
  embeddedPathFromUri,
  getEmbeddedFS,
  listEmbeddedResourceUris,
  readEmbeddedResource,
} from "./embedded-fs"

describe("embedded filesystem", () => {
  test("memoises initialisation promise", () => {
    const first = getEmbeddedFS()
    const second = getEmbeddedFS()

    expect(first).toBe(second)
  })

  test("lists embedded resources as sandy:// URIs", async () => {
    const uris = await listEmbeddedResourceUris()

    expect(uris).toContain("sandy://skills/cli/SKILL.md")
    expect(uris).toContain("sandy://skills/mcp/SKILL.md")
  })

  test("reads resource content by URI", async () => {
    const content = await readEmbeddedResource("sandy://skills/mcp/resources/scripting-guide.md")

    expect(content).toContain("SANDY_OUTPUT")
  })

  test("rejects non-sandy URIs", () => {
    expect(() => embeddedPathFromUri("https://example.com/file.md")).toThrow(
      "resource URI must start with sandy://",
    )
  })

  test("normalises URI path", () => {
    expect(embeddedPathFromUri("sandy://skills/mcp/SKILL.md")).toBe("skills/mcp/SKILL.md")
    expect(embeddedPathFromUri("sandy:///skills/mcp/SKILL.md")).toBe("skills/mcp/SKILL.md")
  })
})
