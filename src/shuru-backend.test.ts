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

describe("ShuruBackend.imageCreate", () => {
  test("does not throw when Netskope cert is absent", async () => {
    const { executor } = makeExecutor()
    const backend = new ShuruBackend(executor)
    // Cert file doesn't exist — must not throw, just skip
    await expect(backend.imageCreate()).resolves.toBeUndefined()
  })

  test("calls shuru checkpoint create sandy with --allow-net and bootstrap mount", async () => {
    const { executor, calls } = makeExecutor()
    const backend = new ShuruBackend(executor)
    await backend.imageCreate()

    const cmd = calls[0]
    expect(cmd.slice(0, 4)).toEqual(["shuru", "checkpoint", "create", "sandy"])
    expect(cmd).toContain("--allow-net")

    const mountIdx = cmd.indexOf("--mount")
    expect(mountIdx).toBeGreaterThan(-1)
    expect(cmd[mountIdx + 1]).toMatch(/^.+:\/tmp\/bootstrap$/)

    const sepIdx = cmd.indexOf("--")
    expect(sepIdx).toBeGreaterThan(-1)
    expect(cmd.slice(sepIdx + 1).join(" ")).toContain("/tmp/bootstrap/init.sh")
  })
})

describe("ShuruBackend.imageDelete", () => {
  test("calls shuru checkpoint delete sandy", async () => {
    const { executor, calls } = makeExecutor()
    const backend = new ShuruBackend(executor)
    await backend.imageDelete()
    expect(calls[0]).toEqual(["shuru", "checkpoint", "delete", "sandy"])
  })
})

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
