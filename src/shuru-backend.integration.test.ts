/**
 * Integration tests for ShuruBackend — require a real shuru binary.
 * Run with: INTEGRATION=true bun test src/shuru-backend.integration.test.ts
 */
import { describe, expect, test } from "bun:test"
import { ShuruBackend } from "./shuru-backend"

const INTEGRATION = process.env.INTEGRATION === "true"

describe("ShuruBackend (integration)", () => {
  test.skipIf(!INTEGRATION)("imageExists returns a boolean without throwing", async () => {
    const backend = new ShuruBackend()
    const result = await backend.imageExists()
    expect(typeof result).toBe("boolean")
  })

  test.skipIf(!INTEGRATION)("imageCreate creates the sandy checkpoint", async () => {
    const backend = new ShuruBackend()
    await backend.imageCreate()
    expect(await backend.imageExists()).toBe(true)
  })

  test.skipIf(!INTEGRATION)("imageDelete removes the sandy checkpoint", async () => {
    const backend = new ShuruBackend()
    await backend.imageDelete()
    expect(await backend.imageExists()).toBe(false)
  })
})
