import { makeCli } from "./cli"
import type { ProgressCallback } from "./core"
import { createBackend } from "./sandbox"

const onProgress: ProgressCallback = (msg: string) => {
  const underline = "─".repeat(msg.length)
  process.stderr.write(`\n\x1b[1;36m→ ${msg}\n  ${underline}\x1b[0m\n`)
}

async function main(): Promise<void> {
  const backend = await createBackend()

  await makeCli(backend, onProgress).parseAsync()
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`sandy: ${message}\n`)
  process.exitCode = 1
})
