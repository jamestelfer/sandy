# Embedded resources initial design reference

Source reference: <https://claude.ai/public/artifacts/b17fc3cc-f017-45d9-bfa5-e4fadec3f98a>

This document captures the original design intent used to shape implementation.

## Overview

Sandy embeds skill documentation and resources directly in the binary. This allows CLI and MCP interfaces to serve the same packaged content without external files.

## Embedded filesystem concept

- Store content under `embedded/` in the repository.
- Pack `embedded/` into `embedded.tar` at build time.
- Embed `embedded.tar` into the Bun-compiled binary.
- On first access, unpack tar into an in-memory filesystem.

## Skill layout

Design expects two self-contained skill trees:

- `skills/cli/`
- `skills/mcp/`

Resource duplication is intentional. Symlinks are avoided because partial clones and skill ecosystems do not handle cross-skill links reliably.

## URI model

All embedded files map to `sandy://` URIs by path:

- `sandy://skills/cli/SKILL.md`
- `sandy://skills/cli/resources/examples.md`
- `sandy://skills/mcp/SKILL.md`
- `sandy://skills/mcp/resources/examples/ec2_describe.ts`

## Build model

### Pack step

Use a TypeScript script (run by Bun) to create the tar archive for portability.

### Embed step

Use Bun file embedding:

```ts
import tarPath from "../embedded.tar" with { type: "file" }
```

### Runtime initialisation

- Read embedded tar bytes.
- Extract to memfs.
- Memoise initialisation so extraction runs once.

## CLI interface design

### `sandy resource`

- Without args: list all embedded resources as JSON `sandy://` URIs.
- With URI arg: print resource content.

### `sandy prime`

- Print CLI-flavoured SKILL.md.
- This is session onboarding content for CLI-driven agents.

## MCP interface design

- Serve embedded resources via standard MCP resources.
- Add `prime` tool returning MCP-flavoured SKILL.md.

## Dependency rationale

- `tar-fs`: pack and extract tar streams, supports custom fs target.
- `memfs`: runtime in-memory filesystem for extracted content.

## Notes carried into implementation

- Initialisation is lazy.
- URI mapping is direct and predictable.
- CLI and MCP skill resource trees stay in sync manually or via lint/tests.

## Repository-specific migration note

For this repository, existing content in `src/mcp-resources/*` is migrated into `embedded/skills/mcp/resources/*` and then served through the embedded filesystem pathway.
