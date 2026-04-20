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

- All `@aws-sdk/client-*` packages (ec2, ecs, ecr, s3, iam, lambda, cloudformation, ssm, secrets-manager, etc.)
- `arquero` — data table manipulation and aggregation
- `simple-ascii-chart` — ASCII line and bar charts for terminal output
- `console-table-printer` — table output
- `@fast-csv/format` — CSV generation
- `jmespath` — JSON query language

## AWS credentials

Credentials resolved via IMDS. No static credentials needed — start an IMDS server and pass the port to `sandy run --imds-port`.

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

`console-table-printer` has no context7 entry — the README is the primary documentation.

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
