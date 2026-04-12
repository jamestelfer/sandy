# Process Recommendations: AI-Assisted Implementation

> Derived from the Sandy TypeScript rewrite retrospective.
> Branch: `feature/sandy-rewrite` — 75 commits, 43 autonomous / 32 user-guided correction.
> Model: claude-sonnet-4-6. Skills in scope: `/write-a-prd`, `/prd-to-plan`, `/tdd`.

---

## Part 1: Phase-by-phase process

### Phase 0: PRD (`/write-a-prd`)

**[Critical] Add a smoke test matrix as a required PRD section**

The PRD must end with a literal shell script — not prose, not a checklist — that proves the system works when run. Written at PRD time, before any implementation. This is the contract between the user and the implementation.

```bash
#!/usr/bin/env bash
# smoke-test.sh — written at PRD time, run at phase completion
set -e
./dist/sandy --help | grep -q "config\|image\|run"
./dist/sandy config | grep -q "shuru"
./dist/sandy config --docker && ./dist/sandy config | grep -q "docker"
INTEGRATION=true bun test src/docker-backend.integration.test.ts
echo "smoke: OK"
```

The Sandy PRD had 60 requirements. None of them said "run `./dist/sandy config`." That is why the compiled binary could be broken for the entire autonomous phase without it mattering.

---

**[High] Distinguish observable requirements from structural ones**

Tag every EARS requirement `[observable]` or `[structural]`.

- **Structural**: "The backend interface shall define `imageCreate`, `imageDelete`, `imageExists`, and `run`" — verified by reading the code.
- **Observable**: "When `sandy image create` is invoked, a Docker image tagged `sandy:latest` shall appear in `docker images`" — verified only by running the binary.

A PRD where the majority of requirements are structural will produce passing tests and a broken binary. If more than half are structural, revise.

---

**[Medium] Keep implementation decisions out of the requirements body**

"The system shall use dockerode to build a Docker image" is an implementation decision masquerading as a requirement. The requirement is the observable: "the system shall build a Docker image tagged `sandy:latest`." The implementation choice (dockerode) belongs in the Implementation Decisions section. Requirements written with implementation decisions embedded get implemented exactly as written — including their blind spots — without the model questioning whether the choice is correct.

---

**[Medium] Add an explicit runtime environment section**

For projects that compile to a binary or embed assets, the PRD must state: what the build/distribution contract is, and that requirements are verified against the compiled binary, not the development runtime. The Sandy PRD assumed the compiled binary throughout but never stated this. That gap allowed the `Bun.file()` embedding bug to persist unnoticed — unit tests ran from source where the OS could access files directly; the binary could not.

---

### Phase 1: Planning (`/prd-to-plan`)

**[Critical] Each phase must produce and commit a verification script alongside its plan**

Not a checklist. A shell script. Written before implementation begins, committed with the plan, run before the phase is closed. The script must execute against the real environment — invoking the binary, running integration tests — not reading test output.

The phase is not done until the script exits 0.

---

**[Critical] Phase 1 must include: compile the binary, invoke it, verify it returns correct output**

For any project that compiles to a binary or has an asset embedding step, Phase 1's first acceptance criterion must be "the compiled binary runs and returns correct output." Not "the build script completes" — the artifact, invoked from the shell.

For Sandy this would have been: `bun run build && ./dist/sandy --help`. That single command, run at the end of Phase 1, would have caught the `Bun.file()` embedding bug before 42 further commits were built on top of it.

---

**[High] Phases must be sized for a single verification session**

The Sandy Phase 1 covered config, CLI parsing, session management, progress parsing, DummyBackend, and tests — 13 acceptance criteria. This is too large. A phase should be completable and verifiable in a single sitting. Target 4–6 acceptance criteria. If the plan produces phases larger than this, split them.

The prd-to-plan skill's tracer-bullet framing is correct, but "tracer bullet" means the thinnest path that actually runs end-to-end, not "scaffold everything and leave real execution for later." For Sandy the real tracer bullet was: binary runs, one CLI command works, one backend method is called. Everything else is elaboration on that.

---

**[High] Add carry-forward verification: re-run all prior phase scripts before starting the next phase**

Before Phase N begins, run the verification scripts for Phases 1 through N-1. This is cheap because the scripts already exist. It catches regressions before they compound. The Sandy branch had no equivalent — each phase assumed prior phases were intact when some weren't.

---

**[Medium] Tag each acceptance criterion as `[run]` or `[read]`, require at least half to be `[run]`**

- `[read]` = verifiable by inspecting code or test output.
- `[run]` = verifiable only by executing the binary or an integration test.

If most criteria in a phase are `[read]`, the phase is checking structural completeness, not behavioural correctness. A minimum proportion of `[run]` criteria forces phases to be defined in terms of observable behaviour.

---

**[Low] Name integration boundaries explicitly in the plan, with a canary test for each**

Each external system the implementation touches (Docker daemon, Shuru CLI, binary embedding, Bun stream API) should have a named integration boundary in the plan, with a canary test written before the real implementation. The canary does one thing: proves the external system is accessible and the basic API works.

The `demuxDockerStream` function exists because Docker's log stream has a non-obvious 8-byte framing header. This should have been discovered in exploration before the first Docker slice, not after 15 slices produced unreliable output.

---

### Phase 2: Implementation (`/tdd`)

**[Critical] The red test at the integration level is mandatory**

The TDD red-green-refactor loop was applied at the unit level throughout the Sandy autonomous phase. Every slice started with a failing unit test and ended with it passing. This is correct for internal structure — and should continue.

But for each phase there must also be a failing integration-level test or verification script step that starts red and ends green. This test exercises real infrastructure or the real binary. It cannot be satisfied by DummyBackend. The unit cycle and the integration cycle run in parallel — a slice is not complete until both are green.

Unit red-green proves the wiring is correct. Integration red-green proves the behaviour is correct.

---

**[Critical] `bun run build && ./dist/sandy <command>` is part of every TDD cycle**

After every slice that touches backend behaviour, CLI handlers, or binary embedding: rebuild the binary and invoke the relevant command. Not `bun test` — the binary. This is a standing rule, not a periodic check.

Sonnet 4.6 will not do this unless it is explicit in the instructions — it will run the test suite, see green, and move on. This single rule would have caught the `Bun.file()` embedding bug, the yargs argument parsing failures, the output stream data loss, and the progress callback gaps — all in the same session where they were introduced.

---

**[High] Write the test in one prompt turn, stop. Implement in the next**

Sonnet 4.6 holding both test and implementation in context simultaneously produces tests that validate the implementation's own structure rather than the requirement. The model writes what it already knows will pass. Separating the turns — "write the failing test, stop" then "now implement to make it pass" — breaks this feedback loop and forces the test to be written in terms of observable behaviour.

---

**[High] DummyBackend tests verify wiring. Integration tests verify behaviour. Both are required**

Make this distinction explicit in the plan and in CLAUDE.md. The DummyBackend proves dispatch paths are correct, that the right arguments reach the backend, that results are handled. It cannot prove that a Docker container actually runs, that streams deliver data, or that the compiled binary works.

Every feature that touches a real backend has two test requirements: a DummyBackend test (wiring) and an integration test (behaviour). The integration test is gated by `INTEGRATION=true` but is not optional — if there is no integration test, the feature has not been tested at the level that matters.

---

**[Medium] For each external system boundary, spend one turn on API exploration before writing tests**

Before writing the first test for a new external system integration, spend one prompt turn exploring the API in a throwaway script. What does `container.logs()` actually return? What is the wire format? What happens to embedded file paths in a compiled Bun binary? This exploration prevents building an entire implementation on a wrong assumption about how an API behaves.

---

**[Low] Each refactor step must run the full verification script, not just the changed tests**

The refactor step in red-green-refactor is where regressions hide. After refactoring, run `bun run agent` and the phase verification script. A refactor that breaks a prior phase's behaviour should fail immediately.

---

### Cross-cutting: Sonnet 4.6 specifics

**[Critical] Binary invocation is a standing instruction in CLAUDE.md**

Add to CLAUDE.md:

```
## Verification rule

After every implementation commit: `bun run build && ./dist/sandy <relevant command>`.
Tests passing is not sufficient. The compiled binary must be invoked and observed.
```

Sonnet 4.6 follows explicit instructions in CLAUDE.md reliably. It does not spontaneously run things that are not required. This makes binary invocation part of the project's definition of done, enforced from any session context.

---

**[High] Phase completion requires user sign-off, not model self-certification**

Sonnet 4.6 will call a phase complete when unit tests pass and the code looks right. It cannot reliably detect its own runtime bugs. The model should end each phase with "here is the verification script for this phase, please run it and report the result" — not "all tests pass, moving to the next phase."

---

**[High] Gate autonomous continuation at each phase boundary**

The 43-commit autonomous phase had no natural stopping point. A process rule: the model stops at each phase boundary and waits for user confirmation that the verification script passed. Autonomous continuation is gated on user verification.

This changes the economics: failures are caught at phase boundaries (6 checkpoints) rather than at the end (1 checkpoint, 43 commits later). The correction cost per failure drops dramatically.

---

**[Medium] Calibrate phase size to session context**

Sonnet 4.6 is more reliable within a single focused session than across long multi-phase autonomous runs. Decisions made in turn 3 of a session are more consistent with decisions made in turn 30 than decisions made in a different session with different context. Smaller phases that fit within a focused session reduce drift between the plan's intent and the implementation's reality.

---

**[Medium] After extracting each new module, verify nothing in the prior implementation assumed its internals**

After each extraction, explicitly prompt: "does anything in the existing implementation depend on the internals of this module rather than its public interface?" This surfaces coupling before it compounds. The Sandy correction phase extracted 6 new modules from inline code, and each extraction revealed assumptions made about implementation details rather than interfaces.

---

## Part 2: Guardrails — hooks, linters, and reviewers

### Hook architecture

Claude Code provides four hook types: `command` (shell script), `http` (POST to endpoint), `prompt` (single LLM judgment call), `agent` (sub-agent with full tool access). All fire at named lifecycle events. Hooks defined in `.claude/settings.json` are committed and apply to the whole project.

The critical mechanics:
- **Exit 2** from a `command` hook blocks the action; stderr becomes feedback to Claude.
- **Exit 0** proceeds; for `SessionStart` hooks, stdout is injected into Claude's context.
- **`stop_hook_active`** flag in the input JSON must be checked in any `Stop` hook — without it, a blocking Stop hook loops forever (Claude retries, hook fires again).
- The **`if` field** (v2.1.85+) filters within a hook group by tool arguments, not just tool name — `if: "Bash(git commit *)"` means the hook only spawns for that specific command pattern.

---

### Hook 1: Stop hook — binary build and invocation required before Claude finishes

The single highest-impact guardrail. Sonnet 4.6 declares done when unit tests pass. This hook enforces a broader definition of done.

```json
// .claude/settings.json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/verify-done.sh",
        "timeout": 60
      }]
    }]
  }
}
```

```bash
#!/usr/bin/env bash
# .claude/hooks/verify-done.sh

# Mandatory: prevents infinite loop when hook blocks and Claude retries
if [ "$(cat | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

# Full CI cycle: lint + format + build + test
if ! bun run agent 2>&1; then
  echo "bun run agent failed — lint, format, build, or tests are broken" >&2
  exit 2
fi

# The binary must actually run
if ! ./dist/sandy --help > /dev/null 2>&1; then
  echo "Binary ./dist/sandy is not executable or crashes on --help" >&2
  exit 2
fi

exit 0
```

This hook alone would have caught the `Bun.file()` embedding bug, the yargs argument parsing failures, and the output stream data loss — all in the same session they were introduced.

---

### Hook 2: PostToolUse on Edit/Write — auto-run Biome after every file change

Eliminates formatting drift without Claude having to think about it. Biome is fast enough to run on every save. Non-blocking — its purpose is to keep the tree clean so `bun run agent` doesn't fail on formatting issues unrelated to the current work.

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.file_path // empty' | xargs -I{} bun biome check --write {} 2>/dev/null; exit 0"
      }]
    }]
  }
}
```

---

### Hook 3: PreToolUse on `git commit` — block when tests fail

Catches the pattern of Claude committing after a slice before verifying the full suite. The `if` field means the hook script only spawns on commit commands, adding no overhead to other Bash calls.

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "if": "Bash(git commit *)",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/pre-commit-gate.sh"
      }]
    }]
  }
}
```

```bash
#!/usr/bin/env bash
# .claude/hooks/pre-commit-gate.sh
if ! bun test --silent 2>&1; then
  echo "Tests must pass before committing. Run bun test and fix failures." >&2
  exit 2
fi
exit 0
```

---

### Hook 4: SessionStart with `compact` matcher — re-inject the binary invocation rule after compaction

Context compaction wipes injected constraints. This restores the critical one. Stdout from `SessionStart` hooks is injected into Claude's context as a system message.

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{
        "type": "command",
        "command": "echo 'REMINDER: After every implementation commit, run: bun run build && ./dist/sandy <command>. Tests passing alone is not sufficient — the compiled binary must be invoked and observed.'"
      }]
    }]
  }
}
```

---

### Hook 5: PreToolUse on `git push` — integration tests required before push

Heavier gate than the commit hook, reserved for push. Ensures integration tests pass before anything reaches the remote.

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "if": "Bash(git push *)",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/pre-push-gate.sh"
      }]
    }]
  }
}
```

```bash
#!/usr/bin/env bash
# .claude/hooks/pre-push-gate.sh
if ! INTEGRATION=true bun test 2>&1; then
  echo "Integration tests must pass before push. Ensure Docker is running and retry." >&2
  exit 2
fi
exit 0
```

---

### Git pre-commit hook — model-agnostic enforcement

A `.git/hooks/pre-commit` script runs `bun run agent` independently of Claude Code. It fires on every `git commit` regardless of how it is invoked — Claude Code hooks, terminal, IDE. Belt-and-suspenders.

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit (chmod +x this file)
bun run agent || { echo "CI cycle must pass before committing"; exit 1; }
```

This is the hard gate at the git level that cannot be routed around.

---

### Coverage ratchet

Add coverage thresholds to `bunfig.toml`. The threshold only increases — once coverage is at 59%, it cannot drop. Prevents Claude from adding code without tests.

```toml
# bunfig.toml
[test]
coverageThreshold = { line: 59, function: 59, branch: 59 }
```

---

### Opus review sub-agent — where it adds value, where it doesn't

**Where it does not add much:**
- Reviewing individual file diffs — Biome handles style; logic errors Opus catches, Sonnet also catches with a focused prompt.
- Post-implementation review of code Claude just wrote in the same session — both models are subject to confirmation bias on code their model family generated.
- General "is this code good?" passes — weak signal, high cost.

**Where it adds real value:**

*1. Phase-boundary acceptance criteria audit.*
At the end of each phase, an Opus sub-agent reads the plan acceptance criteria and the current code, then evaluates which criteria are actually met versus merely structurally present. This is the task Sonnet most reliably fails at — it ticks criteria by examining code structure rather than by verifying observable behaviour. Opus brings more skepticism to its own model family's output.

*2. Pre-implementation plan review.*
Practitioner data from multi-agent implementations shows pre-implementation review outperforms post-implementation review significantly — moving design effectiveness from 20% to 80–85% in one documented case. An Opus agent reviewing the plan for gaps, missing edge cases, and underspecified integration points before Sonnet writes any code produces higher-quality implementation than Opus reviewing code after Sonnet wrote it.

*3. Cross-phase coherence check.*
After multiple phases, an Opus agent reviewing the accumulated implementation against the original PRD for drift — where later phases silently broke earlier requirements — catches a class of bug that unit tests and per-phase verification scripts miss.

**Configuration:**

```yaml
---
name: phase-auditor
description: Reviews phase completion against plan acceptance criteria. Invoke when a phase is believed complete, before moving to the next phase.
model: opus
---

Read the current phase's acceptance criteria from the plan file in plans/.
Read the relevant source files and test files.
For each acceptance criterion:
  - Determine whether it is BEHAVIOURALLY VERIFIED (running the binary or integration test would confirm it)
    or STRUCTURALLY PRESENT (code exists that appears to implement it, but it has not been run).
  - If structurally present only, explain what would need to be run to verify it.
Check whether any prior phase's criteria appear to have been broken by current changes.
Report in three sections: VERIFIED, STRUCTURAL-ONLY (list what to run), BROKEN.
```

**Cost:** An Opus phase audit touching 5–10 files is roughly 10–20K tokens — $0.15–$0.30 per audit at current rates. Six audits across a project costs under $2. The cost argument against Opus reviewers does not hold at this scale.

**Research note:** SWE-bench data shows a dedicated code-review sub-agent yields approximately +0.5% pass rate — real but modest. The larger gains in multi-agent systems come from task specialisation and diversity of approach rather than raw reviewer strength. The Anthropic advisor tool (`advisor_20260301`, currently in beta) formalises the Opus-reviews-Sonnet pattern inside a single API call for API users — the executor calls `advisor()` when it wants a planning review, Opus runs one inference pass over the transcript and returns advice. Not available in Claude Code today but worth tracking.

---

### Priority order

| Guardrail | What it catches | Effort to implement |
|-----------|----------------|---------------------|
| Stop hook: `bun run agent` + `./dist/sandy --help` | Binary broken, build fails, tests fail | 15 min |
| `git pre-commit` hook: `bun run agent` | Same as above, model-agnostic | 5 min |
| PostToolUse on Edit/Write: Biome auto-fix | Format drift, lint noise | 10 min |
| PreToolUse on `git commit`: `bun test` | Committing broken slices | 10 min |
| SessionStart compact: re-inject binary rule | Constraint loss after compaction | 5 min |
| Coverage ratchet in `bunfig.toml` | Code added without tests | 5 min |
| Opus sub-agent: phase-boundary audit | Acceptance criteria not behaviourally verified | 30 min to define |
| Opus sub-agent: pre-implementation plan review | Plan gaps before coding starts | 20 min to define |
| PreToolUse on `git push`: integration tests | Integration failures reaching remote | 10 min |

The Stop hook and the git pre-commit hook together cover the largest class of failures from the Sandy autonomous phase. Everything else is defence in depth.

---

## Summary

The Sandy autonomous phase produced 43 commits with all tests green, then required 32 user-directed correction commits to fix what didn't work at runtime. The root cause was a gap between what the test suite measures and what the product requires.

**Tests passing is not the same as the tool working.**

The process changes above address this at every level: the PRD makes "done" observable before coding starts; the plan enforces binary invocation at each phase gate; TDD is applied at the integration level, not just the unit level; hooks make the binary invocation rule automatic and non-bypassable; and the Opus sub-agent provides structured skepticism at phase boundaries where Sonnet's self-verification is least reliable.

The single sentence that should appear in every CLAUDE.md for compiled projects:

> After every implementation commit, build the binary and run the relevant CLI command. Do not consider a slice complete until the binary has been invoked and observed.
