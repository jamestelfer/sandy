---
name: sandy
description: Run TypeScript scripts in sandboxed microVMs or Docker containers with AWS SDK access via IMDS. Use when investigating AWS resources, running read-only queries, or executing TypeScript automation that needs AWS credentials.
---

# Sandy

Sandy executes TypeScript scripts in disposable sandboxed environments (Shuru microVMs or Docker containers) with AWS credentials from IMDS.

The CLI uses explicit sessions. Create one first, then run scripts from that session’s `scripts/` directory.

## Setup

Read the scripting guide before writing scripts:

```
sandy resource sandy://skills/cli/resources/scripting-guide.md
```

This guide defines runtime constraints, available AWS SDK packages, and the required async generator pattern.

## IMDS port

Start an IMDS server separately and pass its port to `sandy run` and `sandy check connect`.

## CLI commands

### sandy image

Create or delete the Sandy sandbox image.

```
sandy image create
sandy image delete
sandy image delete --force
```

### sandy session create

Create a session and print the session name plus scripts path.

```
sandy session create
```

### sandy check

Verify sandbox health. Each check creates and deletes an ephemeral session; no session argument is accepted.

```
sandy check baseline
sandy check connect --imds-port 9001
sandy check connect --imds-port 9001 --region ap-southeast-2
```

### sandy run

Run a TypeScript script from `<session>/scripts/`.

```
sandy run --session happy-fox-trail --script inventory.ts --imds-port 9001
sandy run --session happy-fox-trail --script inventory.ts --imds-port 9001 --region ap-southeast-2
sandy run --session happy-fox-trail --script inventory.ts --imds-port 9001 -- arg1 arg2
```

Options:

| Flag | Required | Description |
|------|----------|-------------|
| `--session` | yes | Session name |
| `--script` | yes | Script path relative to `<session>/scripts/` |
| `--imds-port` | yes | Port of the running IMDS server |
| `--region` | no | AWS region (default `us-west-2`) |
| `--` | no | Arguments passed as `process.argv` inside the script |

Session layout on the host:

- `.sandy/<session>/scripts/` mounted read-only at `/workspace/scripts`
- `.sandy/<session>/output/` mounted read-write at `/workspace/output`

Scripts should write files under `process.env.SANDY_OUTPUT`.

### sandy resource

List or read embedded resources.

```
sandy resource
sandy resource sandy://skills/cli/resources/scripting-guide.md
```

### sandy prime

Print the full skill text to stdout.

```
sandy prime
```

## Resources

- `sandy://skills/cli/resources/scripting-guide.md`
- `sandy://skills/cli/resources/examples/ec2_describe.ts`
- `sandy://skills/cli/resources/examples/ecs_services.ts`

```
sandy resource sandy://skills/cli/resources/scripting-guide.md
sandy resource sandy://skills/cli/resources/examples/ec2_describe.ts
sandy resource sandy://skills/cli/resources/examples/ecs_services.ts
```

## Typical workflow

1. Read the scripting guide.
2. Start an IMDS server and note the port.
3. Run `sandy image create` if needed.
4. Run `sandy session create` and note the scripts path.
5. Write a script into that scripts directory.
6. Run `sandy check connect --imds-port <port>`.
7. Run `sandy run --session <name> --script file.ts --imds-port <port>`.
8. Read outputs from `.sandy/<session>/output/` or stdout.

## Operating protocols

These rules apply to every Sandy investigation, regardless of mode. Non-adherence defeats the tool.

### Division of labour

- Sandy is the engine for data retrieval, collation, and mathematical analysis.
- The agent guides diagnosis, forms and tests hypotheses, and decides what to investigate next.
- Do not spend agent tokens wading through raw data. Reduce it in-sandbox with Sandy scripts, `jq`, or local tooling, then summarise.

### Query strategy

- Prefer small, targeted queries. Escalate to wider scans only when a signal warrants depth.
- Constrain `Describe*` and `List*` calls by tag, region, identifier, or time window wherever the API allows.
- Write async-generator iterators for every paginated call. Do not accumulate whole result sets into arrays.

### Data to disk, summary to stdout

- Full data artefacts are written to files under `process.env.SANDY_OUTPUT`.
- Stdout carries short summaries and the evidence that informs the next decision, not raw payloads.
- Record what each file means, either in per-file metadata or via evidence-ledger entries.

### Evidence ledger

For each distinct data artefact relevant to the investigation, the script should call `Evidence.append` (exposed by the in-sandbox `sandy` module) so the ledger stays synchronised with the produced data. The append contract:

```ts
interface EvidenceEntry {
  id: string          // ULID generated inline
  timestamp: string   // ISO 8601
  hypotheses: string[]
  summary: string     // ≤ 20 words (guideline, not enforced)
  dataFile?: string   // path relative to SANDY_OUTPUT
}
```

`hypotheses` is a non-empty-compatible string array of hypothesis ids maintained by the agent in `hypotheses.json` under the session output directory. Dangling hypothesis ids are tolerated at write time and reconciled by the agent.

### Companion MCPs

Two companion MCPs, when available, raise code-generation and AWS-claim correctness. Treat them as recommended-but-optional:

- **Context7** — library and SDK documentation. Use it whenever you need current API shapes, version-specific behaviour, or code examples for any library (including `@aws-sdk/*`). Prefer it over recall from training data.
- **AWS Knowledge Base MCP** — `https://knowledge-mcp.global.api.aws`. Authoritative AWS service documentation: behaviour, limits, pricing, region availability. Prefer it over recall for any AWS-specific claim.

When either companion is absent, ground claims in sandbox-observable evidence. Do not assert API shapes or service behaviour from memory; record any such gap as a known-unknown.

## Triage

On the first substantive research question of a session, classify the work into one of the research modes below, state the chosen mode, and load the matching resource at `sandy://skills/research/modes/<mode>.md`. When the user explicitly signals a mode change, reload the new mode's resource and announce the switch.

### Modes

- **Firefight** — an incident or active failure. Classification cues: words like "down", "errors spiking", "failing", "broken"; stated customer impact; recent deploy correlation.
- **Audit** — discovery or inventory across existing resources. Classification cues: words like "how many", "which", "where is", "what owns"; cost or compliance framing; no stated failure.
- **Architect** — design of a new or changing capability. Classification cues: words like "should we", "trade-off", "alternatives", "design"; discussion of non-existent-yet systems.

If the question does not cleanly match any mode, default to Audit and note the ambiguity to the user.

Where a matching service resource exists under `sandy://skills/research/services/<service>.md`, load it when the service becomes relevant. Missing service resources are non-blocking; record the gap as a known-unknown in `hypotheses.json` or in-context notes.

### Research mode resources

- `sandy://skills/research/modes/firefight.md`
- `sandy://skills/research/modes/audit.md`
- `sandy://skills/research/modes/architect.md`
