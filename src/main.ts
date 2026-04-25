import { makeCli } from "./cli/cli"
import type { ProgressCallback } from "./core/types"
import { createBackend } from "./sandbox/factory"

const onProgress: ProgressCallback = (msg: string) => {
  const underline = "─".repeat(msg.length)
  process.stderr.write(`\n\x1b[1;36m→ ${msg}\n  ${underline}\x1b[0m\n`)
}

async function main(): Promise<void> {
  const backend = await createBackend()

  await makeCli(backend, onProgress).parseAsync()
}

main()
