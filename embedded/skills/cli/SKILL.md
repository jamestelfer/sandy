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
