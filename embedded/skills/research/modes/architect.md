---
name: architect
description: Load when the user's first question is a design decision, a trade-off evaluation, or the shaping of a not-yet-existent system; clarifying dialogue precedes data gathering.
---

# Architect mode

Load when the user's question is about designing a new or changing capability, evaluating trade-offs, or choosing between alternatives. In Architect mode, clarifying dialogue precedes data gathering; the cheapest error to prevent is solving the wrong problem.

## Hard invariants

- Before any script runs, restate the question back to the user and get confirmation. Ambiguity closed at the start saves many wrong scripts later.
- Enumerate at least two design alternatives. A recommendation presented without a stated alternative is advocacy, not architecture.
- Produce a trade-off record in `hypotheses.json` for each alternative; the recommendation references it by id.
- Every data artefact that informs the decision (existing-system inventory, cost estimate, quota check) calls `Evidence.append`.

## Schemas

Write `hypotheses.json` using the shape below. Architect mode uses hypotheses to carry the thesis-antithesis-synthesis structure.

```ts
interface HypothesisFile {
  investigation: string
  mode: "architect"
  hypotheses: Hypothesis[]
}

interface Hypothesis {
  id: string             // e.g. "T-single-region", "A-multi-region", "S-recommend"
  statement: string
  status: "active" | "confirmed" | "refuted" | "superseded"
  timestamp: string
  role?: "thesis" | "antithesis" | "synthesis" | "principle"
  relations?: { synthesisOf?: string[] }
}
```

Evidence entries follow the `EvidenceEntry` shape quoted in the operating protocols.

## Framework

Architect combines the **Hegelian dialectic** (thesis / antithesis / synthesis) with the **Socratic method** as a devil's-advocate loop. Each alternative is a thesis; the critique of it is its antithesis; the recommendation is the synthesis that accepts the critique.

The Socratic loop is the guard rail against advocacy. Having enumerated alternatives, deliberately argue against the leading one: which constraint does it assume that the user has not confirmed? Which failure mode has been hand-waved? Which cost has been folded into "operational overhead"? A synthesis that survives the critique is worth recommending.

Architect work routinely surfaces **principles** — invariants the user cares about (e.g. "no cross-region data transfer for PII"). Record them explicitly in `hypotheses.json` with `role: "principle"`. The recommendation must not contradict a recorded principle.

## Tactical set

Apply these techniques by name. Their detailed definitions live in `harness/tactical-prompt-techniques.md`.

- **Rephrase-and-respond** — use before any script: restate the user's question in your own words, ask for confirmation, and capture the confirmed framing as the `investigation` field.
- **Plan-and-solve** — use once the alternatives are enumerated: produce an explicit plan of what each alternative needs investigated (quotas, cost, integration points) before running the scripts.
- **Devil's advocate** — apply to the leading alternative after evidence is gathered; a leading alternative with no recorded critique is a red flag.
- **Explicit trade-off record** — the synthesis hypothesis references the thesis and antithesis ids it reconciles; the final answer quotes the record.

## State-file usage

- Seed `hypotheses.json` after the rephrase-and-respond exchange. Write principles first (`role: "principle"`, `status: "confirmed"` if the user has explicitly stated them), then each alternative as a `role: "thesis"` or `role: "antithesis"` hypothesis with `status: "active"`.
- Record devil's-advocate critiques by either updating the `statement` of the alternative with the critique attached, or (for substantial critiques) adding a new `role: "antithesis"` hypothesis that points back via `relations`.
- The synthesis hypothesis has `role: "synthesis"`, `relations.synthesisOf` listing every alternative it reconciles, and `status: "active"` until the user accepts the recommendation — then `confirmed`.
- Call `Evidence.append` from every script that produces a data file. Typical artefacts: existing inventory, cost model, quota check, latency baseline, integration dependency map.
- If a service resource is missing for a service the design touches, record it as a known-unknown; do not fabricate service behaviour.

## Closure criteria

Architect concludes when:

1. The synthesis hypothesis is `confirmed` and cites the thesis/antithesis hypotheses it reconciles via `relations.synthesisOf`.
2. Every recorded principle is respected by the synthesis.
3. The recommendation is accompanied by the trade-offs made, in the user's terms, with pointers to the evidence entries that back them.

If the investigation reveals that the question cannot be answered without user input on a new constraint, stop and ask. Do not synthesise against an unverified constraint.
