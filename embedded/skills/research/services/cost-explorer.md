---
name: cost-explorer
description: Load before writing any script that uses CostExplorerClient or CE API calls.
---

# Cost Explorer

Load this resource before writing any script that uses `CostExplorerClient`.

## Hard invariants

- Always construct the client with `region: "us-east-1"`. CE is a global service pinned to that region regardless of where the cost data originates.
- Coverage and Utilization APIs reject an `EndTime` in the current month. Keep two date constants — one for cost/usage queries, one for coverage queries.
- All cost amounts in responses are strings. Convert with `Number()` before arithmetic.

## DO

- Pass `region: "us-east-1"` on every `CostExplorerClient` instantiation.
- Keep two date constants in every CE script:
  ```ts
  const END = "2026-05-01"          // GetCostAndUsage: first of next month is fine
  const COVERAGE_END = "2026-04-01" // GetReservation*/GetSavingsPlans*: first of current month
  ```
- Match `USAGE_TYPE` strings by substring, not equality. They carry region prefixes (`USW2-`, `EU-`, `APS2-`) and some rows have no prefix at all.
- Always emit the `Other` bucket with its member list when classifying usage types — unclassified rows are often the most informative.
- Use `Number(field?.Amount ?? "0")` for every cost amount field.

## DO NOT

- Do not pass an `EndTime` in the current month to `GetReservationCoverage`, `GetReservationUtilization`, `GetSavingsPlansCoverage`, or `GetSavingsPlansUtilization`. Use `COVERAGE_END`.
- Do not combine `THREE_YEARS` + `NO_UPFRONT` in `GetReservationPurchaseRecommendation` — AWS returns zero results for most services. Use `ALL_UPFRONT` or `PARTIAL_UPFRONT` for 3-year terms.
- Do not call `GetRightsizingRecommendation` for any service other than EC2. Passing `AmazonRDS` returns an opaque "opt-in only feature" error regardless of opt-in status.

## Golden Path

```ts
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandInput,
  type ResultByTime,
} from "@aws-sdk/client-cost-explorer"
import { progress } from "../sandy.js"

const ce = new CostExplorerClient({ region: "us-east-1" })

const START = "2025-11-01"
const END = "2026-05-01"           // safe for GetCostAndUsage
const COVERAGE_END = "2026-04-01"  // required for Coverage/Utilization endpoints

async function* getCostAndUsage(
  input: GetCostAndUsageCommandInput,
): AsyncGenerator<ResultByTime[]> {
  let nextToken: string | undefined
  do {
    const resp = await ce.send(
      new GetCostAndUsageCommand({ ...input, NextPageToken: nextToken }),
    )
    const rows = resp.ResultsByTime ?? []
    if (rows.length > 0) yield rows
    nextToken = resp.NextPageToken
  } while (nextToken)
}

progress("fetching monthly costs...")
for await (const batch of getCostAndUsage({
  TimePeriod: { Start: START, End: END },
  Granularity: "MONTHLY",
  Metrics: ["AmortizedCost"],
  GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
})) {
  for (const r of batch) {
    for (const g of r.Groups ?? []) {
      const amount = Number(g.Metrics?.AmortizedCost?.Amount ?? "0")
      progress(`${r.TimePeriod?.Start} ${g.Keys?.[0]}: ${amount.toFixed(2)}`)
    }
  }
}
```

## Pitfalls

**`end date past the beginning of next month`** — `EndTime` is in the current month on a Coverage or Utilization API. Switch to `COVERAGE_END`.

**Zero recommendations returned** — likely `THREE_YEARS + NO_UPFRONT`. AWS does not produce 3-year no-upfront recommendations for most services. Change payment option.

**`Rightsizing EC2 recommendation is an opt-in only feature`** — either passing a non-EC2 service or the payer account is not opted in via Cost Explorer Preferences. Verify the service first; opt-in is org-wide.

**Empty `SavingsPlansCoverages` with `null` Attributes** — no `GroupBy` specified. Add `GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }]`.
