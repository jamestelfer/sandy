# Sandy Scripting Guide

Sandy runs TypeScript scripts in sandboxed microVMs with AWS SDK access via IMDS.

## Runtime environment

| Item | Detail |
|------|--------|
| Working directory | `/workspace` |
| Scripts mount | `/workspace/scripts/` (read-only) |
| Output mount | `/workspace/output/` (read-write) |
| Output env var | `process.env.SANDY_OUTPUT` → `/workspace/output` |
| Runtime | Node.js 24, pnpm, tsc (compiled JS executed by node) |

## Installed packages

- ~175 `@aws-sdk/client-*` packages covering common investigation targets (compute, storage, data, messaging, identity, security, observability, cost). Run `pnpm list --depth=0` inside a session to see the exact set; if a client is missing, fall back to the AWS CLI via the host or request it be added
- `arquero` — dplyr-style dataframes for JS. Use to group, join, filter, derive, and summarise records collected from paginated AWS responses. Reach for it when the answer involves counts per group, joins across clients (e.g. instances × tags), or sorting/top-N analysis
- `simple-ascii-chart` — ASCII line and bar charts for terminal output
- `console-table-printer` — table output
- `@fast-csv/format` — CSV generation
- `jmespath` — JSON query language

## Library usage

One-line idioms per library. **Before writing non-trivial library code, fetch full examples via context7** using the IDs in Library documentation below — these snippets cover only the most common shape.

### arquero

**Default choice for any analysis over collected records.** Reach for arquero any time the answer needs more than a trivial filter — it scales from counts-per-group to joins across clients, rollups with statistics (mean, median, stddev, quantile, correlation), window functions, pivots, and derived columns. Prefer it over hand-rolled loops and `Array.reduce`. Pair with the `aq.op.*` namespace for aggregates and row expressions.

Use when: counting, grouping, joining, filtering, deriving, pivoting, or computing statistics over records from AWS generators.

```typescript
aq.from(rows)
  .groupby("type")
  .rollup({ n: aq.op.count(), p95: aq.op.quantile("latency", 0.95) })
  .orderby(aq.desc("p95"))
  .print()
```

### simple-ascii-chart

Use when: rendering a small numeric series (e.g. daily counts) inline.

```typescript
console.log(plot(points, { width: 40, height: 8 })) // points: [number, number][]
```

### console-table-printer

Use when: presenting results as a bordered terminal table.

```typescript
new Table({ columns: [{ name: "id" }, { name: "state" }] }).addRows(rows).printTable()
```

### @fast-csv/format

Use when: writing rows to a CSV file under `process.env.SANDY_OUTPUT`.

```typescript
const csv = format({ headers: true })
csv.pipe(createWriteStream(`${process.env.SANDY_OUTPUT}/out.csv`))
for (const r of rows) csv.write(r)
csv.end()
```

### jmespath

Use when: projecting or filtering nested AWS response shapes.

```typescript
search(resp, "Reservations[].Instances[].{id: InstanceId, ip: PrivateIpAddress}")
```

## AWS credentials

Credentials resolved via IMDS. No static credentials needed — obtain an IMDS port from the imds-broker MCP before running.

## Constraints

- **No child processes.** Node's permission model blocks `child_process`. Use SDK clients directly.
- **File system access is allowed.** Use `process.env.SANDY_OUTPUT` for output files.

## Mandatory: async generators for all AWS iteration

Every paginated AWS call MUST be an `async function*` generator. Do not accumulate results into arrays.

```typescript
async function* listThings(client: SomeClient): AsyncGenerator<Thing[]> {
  let nextToken: string | undefined;
  do {
    const resp = await client.send(new ListThingsCommand({ NextToken: nextToken }));
    const items = resp.Things ?? [];
    if (items.length > 0) yield items;
    nextToken = resp.NextToken;
  } while (nextToken);
}

for await (const batch of listThings(client)) {
  // process batch
}
```

## Library documentation

Fetch current docs with context7:

| Library | context7 ID |
|---------|------------|
| arquero | `/uwdata/arquero` |
| simple-ascii-chart | `/gtktsc/ascii-chart` |
| AWS SDK JS v3 | `/aws/aws-sdk-js-v3` |
| fast-csv | `/c2fo/fast-csv` |
| JMESPath JS | `/jmespath/jmespath.js` |
| console-table-printer | `/websites/console-table_netlify_app` |

## Examples

Working examples are available as embedded resources:

- `sandy resource sandy://skills/cli/resources/examples/ec2_describe.ts` — Describe EC2 instances with filtering and table output
- `sandy resource sandy://skills/cli/resources/examples/ecs_services.ts` — List ECS services across clusters

## Progress reporting

Import the `progress` function from the `sandy` module to report status to the user. Progress messages are forwarded as notifications and stripped from normal script output. Keep messages terse — findings are signal, status lines are context.

```typescript
import { progress } from "../sandy.js"

progress("fetching EC2 instances...")
progress("processing page 3 of results")
```

## Other guidelines

- **Provide partial results on failure.** Wrap outer-loop iterations in try/catch.
- **Break logic into functions** — generators for iteration, pure functions for analysis.
