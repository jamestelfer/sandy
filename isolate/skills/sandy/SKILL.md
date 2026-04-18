---
name: sandy
description: Run TypeScript scripts in sandboxed Shuru microVMs with AWS access via IMDS. Use when investigating AWS resources, running read-only queries against AWS accounts, or executing TypeScript automation scripts that need AWS SDK access.
---

# Sandy

Sandy runs TypeScript scripts in disposable Linux microVMs with AWS access via an IMDS server on the host. Scripts get a pre-built Node.js environment with AWS SDK packages, and output is mounted back to the host.

## Configuration

Sandy is designed for use in a sandboxed environment, but it must be executed outside of the sandbox. This means excluding the script and allowing it to be executed by the Bash tool.

`settings.local.json` requires:

```json
{
  "permissions": {
    "allow": [
      "Bash(${CLAUDE_SKILL_DIR}/scripts/sandy:*)"
    ],
    "deny": []
  },
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": [
      "${CLAUDE_SKILL_DIR}/scripts/sandy *"
    ]
  }
}
```

## Setup

Create the VM snapshot (one-time, or after bootstrap changes):

```bash
${CLAUDE_SKILL_DIR}/scripts/sandy snapshot create
```

## Verification

Confirm the environment works before writing scripts:

```bash
# 1. Check packages and output writes (no AWS access needed)
${CLAUDE_SKILL_DIR}/scripts/sandy check baseline

# 2. Check AWS connectivity (requires an IMDS port)
${CLAUDE_SKILL_DIR}/scripts/sandy check connect --imds-port <port>
```

Both commands should exit 0 and print a table.

## IMDS port

AWS credentials are provided via an IMDS server running on the host. Use the `imds-broker` MCP to start a server for the required profile and region — it returns a `localhost` URL (e.g. `http://localhost:9001`). Extract the port and pass it to `--imds-port`.

```
# 1. Start IMDS server (returns a localhost URL)
imds-broker: start_server(profile="myaccount-ReadOnly", region="us-west-2") → "http://localhost:9001"

# 2. Extract the port (9001) and run
${CLAUDE_SKILL_DIR}/scripts/sandy run --imds-port 9001 --script path/to/script.ts
```

## Running scripts

```bash
${CLAUDE_SKILL_DIR}/scripts/sandy run --session ${CLAUDE_SESSION_ID} --imds-port <port> --script <path> [-- args...]
```

The run pipeline:
1. `tsc` — type-checks and compiles all files in the scripts directory to JavaScript. Type errors stop execution before any AWS calls are made.
2. `node --permission` — executes the compiled script with Node's permission model enabled (see Constraints below).

Options:
- `--imds-port <port>` — IMDS server port on the host (required; obtain from `imds-broker` MCP)
- `--script <path>` — path to TypeScript file (required)
- `--region <region>` — AWS region (default: `us-west-2`)
- `--session <id>` — session ID for grouping output across runs
- `--output-dir <dir>` — override host output directory
- `-- [args...]` — arguments passed through to the script (available via `process.argv.slice(2)`)

## Constraints

- **No child processes.** Node's permission model blocks `child_process` (`execSync`, `spawn`, `exec`, etc.). Scripts that import or call these will fail at runtime. Use SDK clients directly instead of shelling out to the AWS CLI.
- **File system access is allowed.** Reading and writing files works normally. Use `process.env.SANDY_OUTPUT` for output files.

## Runtime environment

Inside the VM:

| Item | Detail |
|------|--------|
| Working directory | `/workspace` |
| Scripts mount | `/workspace/scripts/` (read-only) |
| Output mount | `/workspace/output/` (read-write) |
| Output env var | `process.env.SANDY_OUTPUT` → `/workspace/output` |
| Host output | `.sandy/<session-id>/` under the working directory (printed to stderr) |
| Runtime | Node.js 24, pnpm, tsc (compiled JS executed by node) |

### Installed packages

- All `@aws-sdk/client-*` packages (e.g. `client-ec2`, `client-ecs`, `client-ecr`, `client-s3`, `client-iam`, `client-lambda`, `client-cloudformation`, `client-ssm`, `client-secrets-manager`, etc.) — see `bootstrap/package.json` for the full list
- `arquero` — data table manipulation and aggregation (similar to pandas/dplyr). Supports filtering, groupby, rollup, join, pivot, and derived columns. Import as `import { from, op } from "arquero"`.
- `asciichart` — ASCII line charts for terminal output. Supports multiple series on one plot, ANSI colors (`asciichart.blue`, `.green`, `.red`, `.magenta`, etc.), and configurable height, min/max bounds, padding, and axis labels. Import as `import asciichart from "asciichart"` and call `asciichart.plot(series, config)`.
- `console-table-printer` — table output
- `@fast-csv/format` — CSV generation
- `jmespath` — JSON query language (with `@types/jmespath`)

### AWS credentials

Credentials are resolved automatically by the AWS SDK via IMDS at `http://10.0.0.1:<port>` (set via `AWS_EC2_METADATA_SERVICE_ENDPOINT` and `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE=IPv4`). `AWS_REGION` is also injected. No static credentials are passed — obtain the IMDS port from the `imds-broker` MCP before running.

## Library documentation

Fetch current docs with context7:

| Library | context7 ID |
|---------|------------|
| arquero | `/uwdata/arquero` |
| asciichart | `/kroitor/asciichart` |
| AWS SDK JS v3 | `/aws/aws-sdk-js-v3` |
| fast-csv | `/c2fo/fast-csv` |
| JMESPath JS | `/jmespath/jmespath.js` |

`console-table-printer` has no context7 entry. Reference: https://github.com/nickolashkraus/console-table-printer (README is the primary documentation).

## Scripting guidelines

### Mandatory: async generators for all AWS iteration

**Every paginated AWS call and every batch-describe loop MUST be an `async function*` generator.** Do not accumulate results into arrays — yield each page's items so callers consume them with `for await`. This is non-negotiable because:

1. Progress is visible immediately (no silent waiting while pages accumulate).
2. A failure on page N doesn't discard pages 1–(N-1).
3. Callers stay in control of when to stop.

**Default pattern — paginated list yielding individual items:**

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
  table.addRow({ /* ... */ });
}
```

**Batched describe pattern — when a downstream API accepts multiple IDs:**

Only yield arrays when the next stage needs the batch boundary (e.g. to pass ARNs to a bulk describe call). The outer consumer still sees individual items.

```typescript
// Yields batches because describeThings needs them as input groups
async function* listThingIds(client: SomeClient): AsyncGenerator<string[]> {
  let nextToken: string | undefined;
  do {
    const resp = await client.send(new ListThingsCommand({ NextToken: nextToken }));
    const ids = (resp.Things ?? []).map(t => t.id!);
    if (ids.length > 0) yield ids;
    nextToken = resp.NextToken;
  } while (nextToken);
}

// Consumes ID batches, yields individual enriched items
async function* describeThings(client: SomeClient): AsyncGenerator<ThingDetail> {
  for await (const idBatch of listThingIds(client)) {
    const resp = await client.send(new DescribeThingsCommand({ Ids: idBatch }));
    for (const detail of resp.Details ?? []) {
      yield detail;
    }
  }
}

// Caller always iterates individual items
for await (const detail of describeThings(client)) {
  table.addRow({ /* ... */ });
}
```

**Anti-pattern — do NOT do this:**

```typescript
// BAD: accumulates everything before the caller sees anything
const listResp = await client.send(new ListThingsCommand({}));
const allItems = listResp.Things ?? [];
const descResp = await client.send(new DescribeThingsCommand({ Ids: allItems.map(t => t.id!) }));
```

### Other guidelines

- **Show progress** to stdout so the user can tell the script is alive and estimate remaining time. Keep it terse — findings are signal, status lines are context.
- **Provide partial results on failure.** Wrap outer-loop iterations in try/catch so one failing resource doesn't abort the scan. Writing JSON chunks to `process.env.SANDY_OUTPUT` as you go is one way to ensure results collected before a failure are preserved.
- **Break logic into functions** — generators for iteration, pure functions for analysis, separate enrichment functions that catch their own errors.

## Example script

Lists services on an ECS cluster with running/desired counts and deployment state. Uses async generators for paginated listing and batched describe.

```bash
${CLAUDE_SKILL_DIR}/scripts/sandy run --imds-port 9001 --script ${CLAUDE_SKILL_DIR}/resources/examples/ecs_services.ts -- my-cluster
```

```typescript
import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
  type Service,
} from "@aws-sdk/client-ecs";
import { Table } from "console-table-printer";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: ecs_services.ts <cluster-name>");
  process.exit(1);
}

const clusterName = args[0];
const region = process.env.AWS_REGION ?? "us-west-2";
const ecs = new ECSClient({ region });

// Generator: yields batches of service ARNs, one page at a time
async function* listServiceArns(cluster: string): AsyncGenerator<string[]> {
  let nextToken: string | undefined;
  do {
    const resp = await ecs.send(
      new ListServicesCommand({ cluster, nextToken })
    );
    const arns = resp.serviceArns ?? [];
    if (arns.length > 0) {
      console.log(`  listed ${arns.length} services...`);
      yield arns;
    }
    nextToken = resp.nextToken;
  } while (nextToken);
}

// Generator: takes ARN batches, describes each batch, yields individual services
async function* describeServices(cluster: string): AsyncGenerator<Service> {
  for await (const arnBatch of listServiceArns(cluster)) {
    const resp = await ecs.send(
      new DescribeServicesCommand({ cluster, services: arnBatch })
    );
    for (const service of resp.services ?? []) {
      yield service;
    }
  }
}

// Consume the stream, building the table as results arrive
const table = new Table({
  title: `ECS Services (${clusterName})`,
  columns: [
    { name: "Service", alignment: "left" },
    { name: "Running", alignment: "right" },
    { name: "Desired", alignment: "right" },
    { name: "Status", alignment: "left" },
    { name: "Deployment", alignment: "left" },
  ],
});

let count = 0;
for await (const service of describeServices(clusterName)) {
  const primaryDeployment = service.deployments?.find(
    (d) => d.status === "PRIMARY"
  );

  table.addRow({
    Service: service.serviceName ?? "unknown",
    Running: service.runningCount ?? 0,
    Desired: service.desiredCount ?? 0,
    Status: service.status ?? "unknown",
    Deployment: primaryDeployment?.rolloutState ?? "unknown",
  });
  count++;
}

if (count === 0) {
  console.log(`No services found in cluster ${clusterName}`);
} else {
  table.printTable();
}
```

See [examples.md](${CLAUDE_SKILL_DIR}/resources/examples.md) for more scripts.
