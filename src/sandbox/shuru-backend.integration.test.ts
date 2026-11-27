/**
 * Integration tests for ShuruBackend — require a real shuru binary.
 * Run with: INTEGRATION=true bun test src/shuru-backend.integration.test.ts
 */
import { describe, expect, test } from "bun:test"
import { OutputHandler } from "../output"
import { establishWorkDir, Session } from "../session"
import {
  EGRESS_PROBE_PATH,
  EGRESS_PROBE_SCRIPT,
  startEgressProbe,
  useTestCwdIsolation,
} from "../test-support"
import { ShuruBackend } from "."

useTestCwdIsolation()

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
    "run allows a script to reach the host IMDS endpoint",
    async () => {
      const backend = new ShuruBackend()
      if (!(await backend.imageExists(noop))) {
        await backend.imageCreate(noop)
      }

      await establishWorkDir()
      await using session = await Session.ephemeral()
      await using probe = startEgressProbe()
      const scriptPath = await session.writeScript("egress.ts", EGRESS_PROBE_SCRIPT)

      const result = await backend.run(
        {
          scriptPath,
          imdsPort: probe.port,
          session: session.name,
          sessionDir: session.dir,
        },
        noop,
      )
      expect(result.exitCode).toBe(0)
      expect(probe.requests).toContain(EGRESS_PROBE_PATH)
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
