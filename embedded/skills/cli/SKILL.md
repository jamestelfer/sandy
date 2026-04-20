---
name: sandy
description: Run TypeScript scripts in sandboxed microVMs or Docker containers with AWS SDK access via IMDS. Use when investigating AWS resources, running read-only queries, or executing TypeScript automation that needs AWS credentials.
---

# Sandy

Sandy executes TypeScript scripts in disposable sandboxed environments (Shuru microVMs or Docker containers) with AWS credentials provided via IMDS. The CLI exposes subcommands for managing the sandbox and running scripts.

## Setup

Before running scripts, read the scripting guide:

```
sandy resource sandy://skills/cli/resources/scripting-guide.md
```

This contains the runtime environment, available AWS SDK packages, scripting constraints, and mandatory patterns.

## IMDS port

AWS credentials are provided via an IMDS server on the host. Start one separately and note the port number (e.g. `9001`) to pass to `sandy run` and `sandy check connect`.

## CLI commands

### sandy image

Create or delete the Sandy sandbox image. Run once before using `sandy run`.

```
sandy image create
sandy image delete
sandy image delete --force   # clean rebuild, removes cached layers
```

### sandy check

Verify the sandbox environment is working.

```
sandy check baseline                         # no AWS needed
sandy check connect --imds-port 9001         # requires IMDS port
sandy check connect --imds-port 9001 --region ap-southeast-2
```

### sandy run

Run a TypeScript script in the sandbox.

```
sandy run --script /path/to/script.ts --imds-port 9001
sandy run --script /path/to/script.ts --imds-port 9001 --region ap-southeast-2
sandy run --script /path/to/script.ts --imds-port 9001 --session happy-fox-trail
sandy run --script /path/to/script.ts --imds-port 9001 -- arg1 arg2
```

Options:

| Flag | Required | Description |
|------|----------|-------------|
| `--script` | yes | Path to the TypeScript file |
| `--imds-port` | yes | Port of the running IMDS server |
| `--region` | no | AWS region (default `us-west-2`) |
| `--session` | no | Reuse a previous session's output directory |
| `--output-dir` | no | Override the output directory path |
| `--` | no | Arguments passed as `process.argv` inside the script |

Output files written to `process.env.SANDY_OUTPUT` inside the sandbox appear in `.sandy/<session>/` on the host.

### sandy resource

List or read embedded resources.

```
sandy resource                                                    # list all resource URIs
sandy resource sandy://skills/cli/resources/scripting-guide.md    # read a resource
```

### sandy prime

Print the full skill text (this file) to stdout.

```
sandy prime
```

## Resources

Read these before writing scripts:

| Resource | Content |
|----------|---------|
| `sandy://skills/cli/resources/scripting-guide.md` | Runtime environment, packages, constraints, async generator pattern |
| `sandy://skills/cli/resources/examples/ec2_describe.ts` | Example: describe EC2 instances with pagination |
| `sandy://skills/cli/resources/examples/ecs_services.ts` | Example: list ECS services with running/desired counts |

```
sandy resource sandy://skills/cli/resources/scripting-guide.md
sandy resource sandy://skills/cli/resources/examples/ec2_describe.ts
sandy resource sandy://skills/cli/resources/examples/ecs_services.ts
```

## Typical workflow

1. Read the scripting guide: `sandy resource sandy://skills/cli/resources/scripting-guide.md`
2. Start an IMDS server and note the port
3. `sandy image create` if image not yet built
4. `sandy check connect --imds-port <port>` to verify connectivity
5. Write script following the async generator pattern from the guide
6. `sandy run --script path/to/script.ts --imds-port <port>`
7. Read output from the session directory or stdout
