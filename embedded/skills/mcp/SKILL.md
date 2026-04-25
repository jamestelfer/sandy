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
