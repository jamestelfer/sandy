---
name: firefight
description: Load when the user's first question signals an active incident, failure, or customer-impacting regression; time-to-signal dominates completeness.
---

# Firefight mode

Load when the user reports an incident, active failure, or live customer impact and time-to-signal dominates completeness.

## Hard invariants

- Operate under an explicit step budget. State it up front (e.g. "I will run at most 6 Sandy scripts before reporting findings or re-scoping") and track spend in context.
- Enumerate candidate causes **before** gathering evidence. The first script is a disambiguator, not a data dump.
- Record each candidate cause as an active hypothesis in `hypotheses.json`. Transition status only when evidence confirms or refutes.
- Every data artefact that moves belief calls `Evidence.append` with the hypotheses it informs.

## Schemas

The hypothesis and evidence shapes are defined by the operating protocols and the in-sandbox helper. Write `hypotheses.json` as:

```ts
interface HypothesisFile {
  investigation: string
  mode: "firefight"
  hypotheses: Hypothesis[]
}

interface Hypothesis {
  id: string             // short, stable, e.g. "H1", "H-5xx-lb"
  statement: string
  status: "active" | "confirmed" | "refuted" | "superseded"
  timestamp: string      // ISO 8601, updated on transition
  role?: "primary" | "alternative"
}
```

Evidence entries follow the `EvidenceEntry` shape quoted in the operating protocols.

## Framework

Firefight combines **Abductive reasoning** with the **OODA loop**. Abductive reasoning supplies the candidate-cause enumeration up front: given the reported symptom, list the few most-probable causes and stop. The OODA loop governs the iteration: observe the latest evidence, orient against your candidate set, decide the next disambiguating query, act via Sandy. Repeat until one hypothesis dominates or the step budget is exhausted.

Keep the candidate list small (three to five). A candidate list of one is a commitment to a single narrative and will survive contradicting evidence. A list of ten dilutes every query you write.

Bias evidence collection toward **refutation**, not confirmation. A script that cheaply rules out two of five hypotheses is worth more than one that adds weight to the leading candidate.

## Tactical set

Apply these techniques by name. Their detailed definitions live in `harness/tactical-prompt-techniques.md`.

- **Hypothesis-First / Differential Diagnosis** — use before writing the first script, to enumerate the candidate set.
- **ReAct loop** — use for every iteration after the first: reasoning trace, tool call, observation, update.
- **Known-unknowns tracking** — keep a running list of gaps you deliberately choose not to close (companion MCP absent, region not in scope, permission missing); surface them in the final report.
- **Step-back check** — apply once the budget is half-spent: if no candidate has moved, the candidate set is likely wrong; stop and re-enumerate.

## State-file usage

- Create `hypotheses.json` on the first substantive step. Populate it with the initial candidate set (each as `role: "primary"` or `"alternative"`), `status: "active"`, and timestamps.
- Transition status on evidence that materially confirms or refutes a hypothesis; update the `timestamp`. Never silently drop a hypothesis — mark it `refuted` or `superseded` with a reason in the `statement` update.
- Call `Evidence.append` from every Sandy script whose output informs a hypothesis. Include all hypotheses the artefact speaks to, not just the leading one.
- If a service resource is missing for a service in scope, record the gap as a `role: "alternative"` hypothesis or an inline note — do not silently proceed as though the data did not matter.

## Closure criteria

Firefight concludes when one of the following holds:

1. One hypothesis is `confirmed` and the remaining candidates are `refuted`. Report the root cause, the evidence trail, and recommended mitigation.
2. The step budget is exhausted. Report the leading candidate with its supporting evidence, the `active` hypotheses that remain, and what further queries would disambiguate.
3. The symptom vanished without a clear cause. Report the observation, keep the `active` hypotheses for handover, and recommend monitoring.

Do not extend the budget without stating why. "I need two more scripts because evidence E1 ruled out two hypotheses and narrowed to one candidate" is acceptable; "just one more" is not.
