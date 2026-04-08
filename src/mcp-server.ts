import { readFileSync } from "node:fs"
import type { Backend } from "./backend"
import { createSession } from "./session"
import type { RunOptions } from "./types"
import { DEFAULT_REGION } from "./types"

// Example scripts — embedded in binary by Bun at build time
import ec2DescribePath from "../isolate/skills/sandy/resources/examples/ec2_describe.ts" with {
  type: "file",
}
import ecsServicesPath from "../isolate/skills/sandy/resources/examples/ecs_services.ts" with {
  type: "file",
}

const EXAMPLES: Record<string, string> = {
  ec2_describe: readFileSync(ec2DescribePath, "utf-8"),
  ecs_services: readFileSync(ecsServicesPath, "utf-8"),
}

const SCRIPTING_GUIDE = `# Sandy Scripting Guide

Sandy runs TypeScript scripts in sandboxed microVMs with AWS SDK access via IMDS.

## Runtime environment

| Item | Detail |
|------|--------|
| Working directory | \`/workspace\` |
| Scripts mount | \`/workspace/scripts/\` (read-only) |
| Output mount | \`/workspace/output/\` (read-write) |
| Output env var | \`process.env.SANDY_OUTPUT\` → \`/workspace/output\` |
| Runtime | Node.js 24, pnpm, tsc (compiled JS executed by node) |

## Installed packages

- All \`@aws-sdk/client-*\` packages (ec2, ecs, ecr, s3, iam, lambda, cloudformation, ssm, secrets-manager, etc.)
- \`arquero\` — data table manipulation and aggregation
- \`asciichart\` — ASCII line charts for terminal output
- \`console-table-printer\` — table output
- \`@fast-csv/format\` — CSV generation
- \`jmespath\` — JSON query language

## AWS credentials

Credentials resolved via IMDS. No static credentials needed — obtain an IMDS port from the imds-broker MCP before running.

## Constraints

- **No child processes.** Node's permission model blocks \`child_process\`. Use SDK clients directly.
- **File system access is allowed.** Use \`process.env.SANDY_OUTPUT\` for output files.

## Mandatory: async generators for all AWS iteration

Every paginated AWS call MUST be an \`async function*\` generator. Do not accumulate results into arrays.

\`\`\`typescript
async function* listThings(client: SomeClient): AsyncGenerator<Thing[]> {
  let nextToken: string | undefined;
  do {
    const resp = await client.send(new ListThingsCommand({ NextToken: nextToken }));
    const items = resp.Things ?? [];
    if (items.length > 0) yield items;
    nextToken = resp.NextToken;
  } while (nextToken);
}

for await (const batch of listThings(client)) {
  // process batch
}
\`\`\`

## Other guidelines

- **Show progress** to stdout so the user can tell the script is alive.
- **Provide partial results on failure.** Wrap outer-loop iterations in try/catch.
- **Break logic into functions** — generators for iteration, pure functions for analysis.
`

export interface SandyRunParams {
  script: string
  imdsPort: number
  region?: string
  args?: string[]
}

export interface SandyRunResult {
  exitCode: number
  stdout: string
  stderr: string
  sessionName: string
}

export class SandyMcpServer {
  private activeSessionName: string | null = null
  private activeSessionDir: string | null = null

  constructor(private backend: Backend) {}

  handleScriptingGuideResource(): string {
    return SCRIPTING_GUIDE
  }

  handleExampleResource(name: string): string {
    const content = EXAMPLES[name]
    if (!content) {
      throw new Error(`Unknown example: ${name}. Available: ${Object.keys(EXAMPLES).join(", ")}`)
    }
    return content
  }

  async handleSandyCheck(
    action: "baseline" | "connect",
    imdsPort?: number,
  ): Promise<SandyRunResult> {
    const scriptPath = action === "baseline" ? "__baseline__" : "__connect__"
    const port = imdsPort ?? 0
    if (!this.activeSessionDir) {
      const session = await createSession(this.activeSessionName ?? undefined)
      this.activeSessionName = session.name
      this.activeSessionDir = session.dir
    }
    const opts: RunOptions = {
      scriptPath,
      imdsPort: port,
      region: DEFAULT_REGION,
      session: this.activeSessionName!,
      sessionDir: this.activeSessionDir!,
    }
    const result = await this.backend.run(opts, () => {})
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      sessionName: this.activeSessionName!,
    }
  }

  async handleSandyImage(action: "create" | "delete"): Promise<void> {
    if (action === "create") {
      await this.backend.imageCreate()
    } else {
      await this.backend.imageDelete()
    }
  }

  handleResumeSession(sessionName: string): void {
    this.activeSessionName = sessionName
    // Dir will be created lazily on next sandy_run
    this.activeSessionDir = null
  }

  async handleSandyRun(
    params: SandyRunParams,
    onProgress?: (message: string) => void,
  ): Promise<SandyRunResult> {
    if (!this.activeSessionDir) {
      const session = await createSession(this.activeSessionName ?? undefined)
      this.activeSessionName = session.name
      this.activeSessionDir = session.dir
    }

    const opts: RunOptions = {
      scriptPath: params.script,
      imdsPort: params.imdsPort,
      region: params.region ?? DEFAULT_REGION,
      session: this.activeSessionName,
      sessionDir: this.activeSessionDir,
      scriptArgs: params.args,
    }

    const result = await this.backend.run(opts, (msg) => onProgress?.(msg))

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      sessionName: this.activeSessionName,
    }
  }
}
