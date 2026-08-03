---
name: sandy-cli
description: Run TypeScript scripts in sandboxed microVMs or Docker containers with AWS SDK access via IMDS, through the sandy CLI. Use when investigating AWS resources, running read-only queries, or executing TypeScript automation that needs AWS credentials via shell commands.
---

# Sandy (CLI)

This plugin bootstraps the `sandy` command-line tool. Sandy's real instructions live in its
`prime` output, not here.

## First action

Run in a shell:

```
sandy prime
```

Read its complete output before doing anything else. It documents the available `sandy`
subcommands, the IMDS credential flow, and the `sandy resource sandy://skills/cli/resources/...`
commands you need for script-authoring guidance.

Follow every resource link `sandy prime` gives you before writing or running a script.
