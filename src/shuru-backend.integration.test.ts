/**
 * Integration tests for ShuruBackend — require a real shuru binary.
 * Run with: INTEGRATION=true bun test src/shuru-backend.integration.test.ts
 */
import { describe, expect, test } from "bun:test"
import { OutputHandler } from "./output-handler"
import { ShuruBackend } from "./shuru-backend"

const INTEGRATION = process.env.INTEGRATION === "true"
const TIMEOUT = 300_000

const noop = new OutputHandler(() => {})

describe("ShuruBackend (integration)", () => {
  test.skipIf(!INTEGRATION)(
    "imageExists returns a boolean without throwing",
    async () => {
      const backend = new ShuruBackend()
      const result = await backend.imageExists(noop)
      expect(typeof result).toBe("boolean")
    },
    TIMEOUT,
  )

  test.skipIf(!INTEGRATION)(
    "imageCreate creates the sandy checkpoint",
    async () => {
      const backend = new ShuruBackend()
      await backend.imageCreate(noop)
      expect(await backend.imageExists(noop)).toBe(true)
    },
    TIMEOUT,
  )

  test.skipIf(!INTEGRATION)(
    "imageDelete removes the sandy checkpoint",
    async () => {
      const backend = new ShuruBackend()
      await backend.imageDelete(noop)
      expect(await backend.imageExists(noop)).toBe(false)
    },
    TIMEOUT,
  )
})
