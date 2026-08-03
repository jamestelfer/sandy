---
name: sandy-mcp
description: Run TypeScript scripts in sandboxed microVMs or Docker containers with AWS SDK access via IMDS, through the Sandy MCP server. Use when investigating AWS resources, running read-only queries, or executing TypeScript automation that needs AWS credentials via MCP tools.
---

# Sandy (MCP)

This plugin registers the Sandy MCP server. Sandy's real instructions live in its `prime` tool,
not here.

## First action

Call the MCP `prime` tool:

```
prime()
```

Read its complete output before doing anything else. It documents the available `sandy_*` tools,
the IMDS credential flow, and the `sandy://skills/mcp/resources/...` links you need for
script-authoring guidance.

Follow every resource link `prime` gives you before writing or running a script.
