# Sandy + imds-broker Presentation Design

## Overview

7-minute presentation for Culture Amp engineering peers. Deliverables: narrative outline with speaker notes, draw.io architecture diagram. The presenter builds slides from these materials.

## Audience

Engineering peers at Culture Amp. Familiar with AWS, Claude Code, and likely MCP at a conceptual level. No need to explain foundational concepts.

## Core message

Direct agent access to AWS is dangerous. Claude Code's sandbox blocks CLI usage but also blocks AWS access. Existing AWS MCPs solve access but burn tokens through multi-call patterns. Research shows limited code generation is more effective. Sandy + imds-broker give agents safe, token-efficient AWS access through sandboxed script execution.

## Structure: Problem -> Architecture -> Demo

### Beat 1: The problem (1.5 min)

**Slide: "Agents need AWS access"**

Speaker notes:
- AI agents doing infrastructure work need to query AWS — describe instances, list services, check configurations
- Giving an agent your AWS credentials and shell access means it can do anything: modify resources, exfiltrate data, run arbitrary commands
- Claude Code's sandbox helps: blocks CLI usage, restricts filesystem (no `~/.aws`), limits network egress
- But now the agent can't reach AWS at all — the sandbox is doing its job too well

**Slide: "Why not AWS MCPs?"**

Speaker notes:
- MCP servers exist that wrap AWS APIs as tools. The agent calls `describe_instances`, gets results, calls `list_services`, etc.
- Problem: each query is multiple tool calls. The agent processes intermediate JSON, decides what to call next, processes more JSON. Tokens add up.
- Research from Apple ("CodeAct"), Anthropic, and others shows that limited code generation — write a focused script, execute it, return the result — is a more effective pattern for tool use than iterated API calls
- One script replaces N tool calls. The agent writes the query logic once, the script runs to completion, results come back in one shot.

### Beat 2: Architecture (2 min)

**Slide: "imds-broker: credentials without exposure"**

Speaker notes:
- imds-broker emulates AWS EC2 Instance Metadata Service (IMDSv2) on localhost
- Reads from your existing AWS profiles/SSO sessions, vends temporary credentials on demand
- Default filter: only exposes ReadOnly/ViewOnly profiles to limit blast radius
- Not Sandy-specific — works for any container, subprocess, or tool that speaks AWS SDK
- Go binary, runs as an MCP server or standalone CLI

**Slide: Architecture diagram (draw.io)**

Speaker notes (walk through the diagram):
- Left: Claude Code agent running inside its sandbox. Can write files, can't reach AWS or `~/.aws`
- Middle-top: imds-broker MCP on the host. Agent calls `start_server(profile, region)`, gets back a port number
- Middle-bottom: Sandy MCP on the host. Agent calls `sandy_run(script, imdsPort)`, Sandy launches a microVM
- Right: the Shuru microVM. Script mounted read-only, network restricted to `*.amazonaws.com` only, no child processes. AWS SDK inside the VM fetches credentials from imds-broker via IMDS protocol
- Far right: AWS APIs
- Key point: three trust boundaries. The agent never sees credentials. The VM never sees static keys. imds-broker only vends temporary tokens for read-only profiles.

**Slide: "Three boundaries, zero trust between them"**

Speaker notes:
- Agent sandbox: can't access credentials, can't call AWS, can't shell out
- imds-broker: only vends temporary credentials, filtered to read-only profiles, local connections only
- Sandy microVM: ephemeral, network-restricted, no child processes, credentials fetched via IMDS and never written to disk
- Each boundary assumes the others are compromised

### Beat 3: Demo (2.5 min)

Live demo in Claude Code. Suggested query: "List my ECS services and their running/desired task counts" or "Describe EC2 instances with tag Environment=production."

What the audience sees:
1. Agent reads the Sandy scripting guide (resource)
2. Agent calls imds-broker to start a credential server — gets a port
3. Agent writes a TypeScript script using AWS SDK
4. Agent calls `sandy_run` with the script and port
5. Results come back — formatted table of ECS services or EC2 instances

What to call out during the demo:
- "The agent just wrote and executed AWS SDK code without ever seeing credentials"
- "That script ran in a disposable VM that's already gone"
- "One tool call replaced what would be 3-4 MCP tool calls with an AWS MCP"

Demo prep notes:
- Pre-build the Sandy image (`sandy image create`) so the demo doesn't wait for image build
- Have imds-broker configured with a working read-only profile
- Test the exact query beforehand; have a fallback screenshot if live demo fails
- Keep the query simple — one service, one region, results that fit on screen

### Beat 4: Wrap (1 min)

**Slide: "Try it"**

Speaker notes:
- Both tools are open source
- imds-broker: github.com/jamestelfer/imds-broker — useful independently for any "give a container AWS creds without env vars" scenario
- Sandy: github.com/jamestelfer/sandy — Claude Code skill for sandboxed AWS queries
- QR codes or short links to both repos

## Diagrams

### Primary architecture diagram (draw.io)

The main diagram shows the interaction between all components. It should communicate:

1. **Four zones** (left to right):
   - Agent sandbox (Claude Code) — restricted environment
   - Host — where imds-broker and Sandy run, outside the sandbox
   - MicroVM (Shuru) — ephemeral, maximally restricted
   - AWS — external services

2. **Two flow paths**:
   - Credential flow: Agent -> imds-broker (start_server) -> port returned -> VM -> imds-broker (GET credentials) -> temp creds returned
   - Script flow: Agent writes script -> Sandy (sandy_run) -> mounts script in VM -> VM executes -> output returned to agent

3. **Security annotations on each boundary**:
   - Agent sandbox: "No `~/.aws`, no network to AWS, no shell escape"
   - imds-broker: "ReadOnly profiles only, temp credentials, local connections"
   - MicroVM: "No child_process, network restricted to `*.amazonaws.com`, ephemeral"

Style: clean boxes with clear labels, muted colours distinguishing the four zones, numbered steps for the flow, security annotations as callout text.

### Optional: comparison diagram

Simple side-by-side showing:
- Left: "AWS MCP approach" — Agent -> MCP -> AWS, Agent -> MCP -> AWS, Agent -> MCP -> AWS (N calls)
- Right: "Sandy approach" — Agent writes script -> Sandy -> VM runs script -> single result back

This reinforces the token efficiency argument from Beat 1.

## Out of scope

- Deep dive into Shuru vs Docker backend differences
- Configuration walkthrough
- Session management details
- Build/distribution pipeline
- The retrospective/recommendations from the Sandy rewrite process
