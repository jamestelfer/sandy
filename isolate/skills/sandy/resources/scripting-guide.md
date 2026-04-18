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
- `asciichart` — ASCII line charts for terminal output
- `console-table-printer` — table output
- `@fast-csv/format` — CSV generation
- `jmespath` — JSON query language

## AWS credentials

Credentials resolved via IMDS. No static credentials needed — obtain an IMDS port from the imds-broker MCP before running.

## Constraints

- **No child processes.** Node's permission model blocks `child_process`. Use SDK clients directly.
- **File system access is allowed.** Use `process.env.SANDY_OUTPUT` for output files.

## Mandatory: async generators for all AWS iteration

Every paginated AWS call MUST be an `async function*` generator that yields individual items. Do not accumulate results into arrays.

```typescript
async function* listThings(client: SomeClient): AsyncGenerator<Thing> {
  let nextToken: string | undefined;
  do {
    const resp = await client.send(new ListThingsCommand({ NextToken: nextToken }));
    for (const item of resp.Things ?? []) {
      yield item;
    }
    nextToken = resp.NextToken;
  } while (nextToken);
}

for await (const thing of listThings(client)) {
  // use thing directly
}
```

## Other guidelines

- **Show progress** to stdout so the user can tell the script is alive.
- **Provide partial results on failure.** Wrap outer-loop iterations in try/catch.
- **Break logic into functions** — generators for iteration, pure functions for analysis.
