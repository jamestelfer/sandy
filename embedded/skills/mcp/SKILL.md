---
name: sandy
description: Run TypeScript scripts in sandboxed microVMs or Docker containers with AWS SDK access via IMDS. Use when investigating AWS resources, running read-only queries, or executing TypeScript automation that needs AWS credentials.
---

# Sandy

Sandy executes TypeScript scripts in disposable sandboxed environments (Shuru microVMs or Docker containers) with AWS credentials provided via IMDS. The MCP server exposes tools for managing the sandbox and running scripts.

## Setup

Before running scripts, read the scripting guide:

```
resource: sandy://skills/mcp/resources/scripting-guide.md
```

This contains the runtime environment, available AWS SDK packages, scripting constraints, and mandatory patterns.

## IMDS port

AWS credentials are provided via an IMDS server on the host. Use the `imds-broker` MCP to start a server and get a port:

```
imds-broker: start_server(profile="myaccount-ReadOnly", region="us-west-2") → "http://localhost:9001"
```

Extract the port number (e.g. `9001`) and pass it to `sandy_run`.

## MCP tools

### sandy_image

Create or delete the Sandy sandbox image. Run once before using `sandy_run`.

```
sandy_image(action: "create")
sandy_image(action: "delete")
```

### sandy_check

Verify the sandbox environment is working.

```
sandy_check(action: "baseline")                  # no AWS needed
sandy_check(action: "connect", imdsPort: 9001)   # requires IMDS port
```

### sandy_run

Run a TypeScript script in the sandbox.

```
sandy_run(
  script: "/path/to/script.ts",
  imdsPort: 9001,
  region: "us-west-2",   // optional, default us-west-2
  args: ["arg1", "arg2"] // optional, passed as process.argv
)
```

Returns: `{ exitCode, stdout, stderr, sessionName }`

The session name identifies the output directory `.sandy/<name>/` on the host. Output files written to `process.env.SANDY_OUTPUT` inside the sandbox appear there.

### sandy_resume_session

Reuse a previous session's output directory on subsequent runs.

```
sandy_resume_session(sessionName: "happy-fox-trail")
```

## Resources

Read these before writing scripts:

| Resource | Content |
|----------|---------|
| `sandy://skills/mcp/resources/scripting-guide.md` | Runtime environment, packages, constraints, async generator pattern |
| `sandy://skills/mcp/resources/examples/ec2_describe.ts` | Example: describe EC2 instances with pagination |
| `sandy://skills/mcp/resources/examples/ecs_services.ts` | Example: list ECS services with running/desired counts |

```
resource: sandy://skills/mcp/resources/scripting-guide.md
resource: sandy://skills/mcp/resources/examples/ec2_describe.ts
resource: sandy://skills/mcp/resources/examples/ecs_services.ts
```

## Typical workflow

1. Read the scripting guide: `resource: sandy://skills/mcp/resources/scripting-guide.md`
2. Start IMDS server via `imds-broker`
3. `sandy_image(action: "create")` if image not yet built
4. `sandy_check(action: "connect", imdsPort: <port>)` to verify connectivity
5. Write script following the async generator pattern from the guide
6. `sandy_run(script: "...", imdsPort: <port>)`
7. Read output from the session directory or `stdout` in the result
