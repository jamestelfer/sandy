import { describe, expect, test } from "bun:test"
import { ShuruBackend } from "./shuru-backend"
import type { ShellExecutor } from "./shuru-backend"

function makeExecutor(
  responses: Record<string, { stdout: string; stderr: string; exitCode: number }> = {},
): { executor: ShellExecutor; calls: string[][] } {
  const calls: string[][] = []
  const executor: ShellExecutor = async (cmd) => {
    calls.push(cmd)
    return responses[cmd.join(" ")] ?? { stdout: "", stderr: "", exitCode: 0 }
  }
  return { executor, calls }
}

describe("ShuruBackend.imageExists", () => {
  test("does not match a checkpoint that contains sandy only as a substring", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": {
        stdout: "not-sandy 2024-01-01\nsandy-extra 2024-01-02\n",
        stderr: "",
        exitCode: 0,
      },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists()).toBe(false)
  })

  test("returns false when sandy is absent from the list", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": { stdout: "other-checkpoint 2024-01-02\n", stderr: "", exitCode: 0 },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists()).toBe(false)
  })

  test("returns false when checkpoint list is empty", async () => {
    const { executor } = makeExecutor({
      "shuru checkpoint list": { stdout: "", stderr: "", exitCode: 0 },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists()).toBe(false)
  })

  test("calls shuru checkpoint list and returns true when sandy is present", async () => {
    const { executor, calls } = makeExecutor({
      "shuru checkpoint list": {
        stdout: "sandy 2024-01-01\nother 2024-01-02\n",
        stderr: "",
        exitCode: 0,
      },
    })
    const backend = new ShuruBackend(executor)
    expect(await backend.imageExists()).toBe(true)
    expect(calls[0]).toEqual(["shuru", "checkpoint", "list"])
  })
})
