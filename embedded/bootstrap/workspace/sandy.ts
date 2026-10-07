import { appendFileSync } from "node:fs"
import { join } from "node:path"
import { nanoid } from "nanoid"

export function progress(message: string): void {
  process.stdout.write(`[--> ${message}\n`)
}

/**
 * Input shape accepted by `Evidence.append`.
 *
 * `summary` is a guideline ≤ 20 words; the runtime does not enforce length.
 * `dataFile` is a path relative to `process.env.SANDY_OUTPUT`; existence is
 * not validated at append time (the script owns the write ordering).
 */
export type EvidenceInput = {
  hypotheses: string[]
  summary: string
  dataFile?: string
}

/**
 * Persisted shape. One JSON object per line in `$SANDY_OUTPUT/evidence.jsonl`.
 */
export type EvidenceEntry = EvidenceInput & {
  id: string
  timestamp: string
}

/**
 * Append-only evidence log written to `$SANDY_OUTPUT/evidence.jsonl`.
 * Each entry links a finding to one or more hypothesis IDs so the agent can
 * trace which data supports or refutes which hypotheses.
 */
export class Evidence {
  public static append(input: EvidenceInput): void {
    if (!Array.isArray(input?.hypotheses)) {
      throw new Error(
        "evidence.append: hypotheses must be an array of hypothesis ids (string[])",
      )
    }

    const entry = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      ...input,
    } satisfies EvidenceEntry

    const line = `${JSON.stringify(entry)}\n`
    appendFileSync(join(process.env.SANDY_OUTPUT ?? "", "evidence.jsonl"), line)

    const marker = input.dataFile ?? "-"
    progress(`evidence[${input.hypotheses.join(",")}] ${marker} — ${input.summary}`)
  }
}
