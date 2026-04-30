---
name: sandy
description: Run TypeScript scripts in sandboxed microVMs or Docker containers with AWS SDK access via IMDS. Use when investigating AWS resources, running read-only queries, or executing TypeScript automation that needs AWS credentials.
---

# Sandy

Sandy executes TypeScript scripts in disposable sandboxed environments (Shuru microVMs or Docker containers) with AWS credentials from IMDS.

Sandy now uses explicit sessions for all MCP operations. There is no implicit active session.

## Setup

Read the scripting guide before writing scripts:

```
resource: sandy://skills/mcp/resources/scripting-guide.md
```

This guide defines runtime constraints, available AWS SDK packages, and the required async generator pattern.

## IMDS port

AWS credentials are provided by an IMDS server on the host. Use `imds-broker` to start one:

```
imds-broker: start_server(profile="myaccount-ReadOnly", region="us-west-2") → "http://localhost:9001"
```

Pass the port number (for example `9001`) to `sandy_run` and `sandy_check(action: "connect")`.

## MCP tools

### sandy_create_session

Create a session and return where scripts must be written.

```
sandy_create_session()
```

Returns: `{ sessionName, scriptsPath }`

### sandy_resume_session

Resume an existing session and return its scripts path.

```
sandy_resume_session(sessionName: "happy-fox-trail")
```

Returns: `{ sessionName, scriptsPath }`

### sandy_image

Create or delete the Sandy sandbox image.

```
sandy_image(action: "create")
sandy_image(action: "delete")
```

### sandy_check

Run a health check. Sandy creates and deletes an ephemeral session for each check; no session parameter is accepted.

```
sandy_check(action: "baseline")
sandy_check(action: "connect", imdsPort: 9001)
sandy_check(action: "connect", imdsPort: 9001, region: "ap-southeast-2")
```

Returns: `{ exitCode, output }`

### sandy_run

Run a TypeScript script from the session `scripts/` directory.

```
sandy_run(
  session: "happy-fox-trail",
  script: "inventory.ts",
  imdsPort: 9001,
  region: "us-west-2",   // optional, default us-west-2
  args: ["arg1", "arg2"] // optional
)
```

For MCP clients without filesystem access, provide inline content. Sandy writes it to `scripts/<script>` before execution.

```
sandy_run(
  session: "happy-fox-trail",
  script: "inventory.ts",
  content: "console.log('hello')",
  imdsPort: 9001
)
```

Returns: `{ exitCode, output, sessionName }`

Session layout on the host:

- `.sandy/<session>/scripts/` mounted read-only at `/workspace/scripts`
- `.sandy/<session>/output/` mounted read-write at `/workspace/output`

Scripts should write files under `process.env.SANDY_OUTPUT`.

Do not run multiple scripts against the same session concurrently. Output collisions are caller-managed.

## Resources

Read these before writing scripts:

- `sandy://skills/mcp/resources/scripting-guide.md`
- `sandy://skills/mcp/resources/examples/ec2_describe.ts`
- `sandy://skills/mcp/resources/examples/ecs_services.ts`

```
resource: sandy://skills/mcp/resources/scripting-guide.md
resource: sandy://skills/mcp/resources/examples/ec2_describe.ts
resource: sandy://skills/mcp/resources/examples/ecs_services.ts
```

## Typical workflow

1. Read the scripting guide.
2. Start IMDS with `imds-broker`.
3. Run `sandy_image(action: "create")` if needed.
4. Run `sandy_create_session()` and capture `{ sessionName, scriptsPath }`.
5. Write script content to `scriptsPath` or pass `content` to `sandy_run`.
6. Run `sandy_check(action: "connect", imdsPort: <port>)`.
7. Run `sandy_run(session: <name>, script: "file.ts", imdsPort: <port>)`.
8. Read outputs from `.sandy/<session>/output/` or from the returned `output` text.

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
