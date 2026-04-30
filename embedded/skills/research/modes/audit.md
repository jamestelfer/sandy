---
name: audit
description: Load when the user's first question is discovery, inventory, cost analysis, or compliance mapping without a stated failure; completeness and provenance dominate speed.
---

# Audit mode

Load when the user asks for discovery, inventory, cost analysis, or compliance mapping and there is no stated incident. This is also the default mode when triage is ambiguous.

## Hard invariants

- Do not assume convention. Every structural claim must rest on evidence gathered in this session, not on naming, tags, or prior knowledge.
- Decompose the question into sub-questions before writing any script. The first script answers the smallest tractable sub-question, not the whole prompt.
- Record each sub-question as an active hypothesis in `hypotheses.json` so that progress is tracked explicitly.
- Every produced data file calls `Evidence.append` with at least one hypothesis id. An Audit with zero evidence entries is an Audit with no provenance.

## Schemas

Write `hypotheses.json` using the shape below. The Audit mode uses hypotheses as sub-question markers, not as competing beliefs.

```ts
interface HypothesisFile {
  investigation: string
  mode: "audit"
  hypotheses: Hypothesis[]
}

interface Hypothesis {
  id: string             // e.g. "Q1", "Q-cost-s3", "F-tagging-gap"
  statement: string      // a sub-question or a stated finding
  status: "active" | "confirmed" | "refuted" | "superseded"
  timestamp: string
  role?: "principle" | "alternative"
}
```

Evidence entries follow the `EvidenceEntry` shape quoted in the operating protocols.

## Framework

Audit combines **First principles thinking** with **least-to-most decomposition**. First principles means: ignore naming conventions, ignore "that team owns it", ignore architectural diagrams. Ground every claim in an API call, a billing export, or a configuration snapshot you collected this session. Least-to-most decomposition supplies the traversal order: start from the smallest undeniable fact (e.g. "which accounts are in scope") and build up.

Audit is slower than Firefight by design. An audit that reports a shallow pattern in thirty seconds is usually wrong because the pattern came from assumption, not evidence.

Record **findings**, not just sub-questions. When a sub-question resolves into a stable fact, turn it into a `confirmed` entry with the fact in the `statement` field. The file then doubles as the working outline of the final report.

## Tactical set

Apply these techniques by name. Their detailed definitions live in `harness/tactical-prompt-techniques.md`.

- **Least-to-most decomposition** — use before writing the first script, to order sub-questions from smallest to largest.
- **Step-back check** — apply every few steps: does the current line of inquiry still serve the original question, or has the investigation drifted into an interesting side-topic?
- **Evidence-ledger discipline** — every script that emits a durable file calls `Evidence.append`; there is no "interim run that does not count".
- **Mid-trajectory re-orientation** — when an evidence entry changes the shape of the problem (e.g. "the cost is concentrated in one account, not spread"), add or re-order sub-questions rather than forcing old ones.

## State-file usage

- Seed `hypotheses.json` with the sub-question decomposition. Each sub-question is `status: "active"` at creation.
- Promote a sub-question to `confirmed` by rewriting its `statement` as the finding and updating the timestamp. Keep the original id stable — the final report traces findings back to sub-questions by id.
- If a sub-question turns out to be the wrong framing, mark it `superseded` and add a replacement rather than editing it silently.
- Call `Evidence.append` from every Sandy script. For broad-sweep scripts that speak to multiple sub-questions, include all of them in the `hypotheses` array.
- For services with no resource under `sandy://skills/research/services/`, either record a known-unknown entry or note it inline; do not infer service behaviour from memory.

## Closure criteria

Audit concludes when all active sub-questions are `confirmed`, `refuted`, or `superseded`, and the findings are sufficient to answer the original question. If the original question expanded during the investigation, report the expansion explicitly — do not quietly ship a different scope. A small residual set of `active` sub-questions is acceptable if each is flagged as out-of-scope for this audit and documented as future work.
