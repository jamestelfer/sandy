# Retrospective: Sandy TypeScript Rewrite

> Branch: `feature/sandy-rewrite`
> Date: 2026-04-12
> Format: Liked / Lacked / Longed for
> Scope: Full branch — autonomous AI phase + user-guided correction phase

---

## Phase boundary

The branch divides into two distinct phases at commit `28e42fa` ("apply biome format fix to skill.test.ts"):

| Phase | Commits | Character |
|-------|---------|-----------|
| Autonomous (AI-driven) | 43 | Plan phases executed, slices committed |
| User-guided correction | 32 | User discovered failures, directed fixes |

The correction phase represents **43% of all commits on the branch** — nearly half the total work — driven by the user finding that very little of the autonomous output actually worked when run.

---

## Liked — what worked

**The plan structure was sound.**
The PRD captured requirements comprehensively and the phased plan (scaffold → CI → Shuru → MCP → Docker → distribution) was a logical progression. Architectural decisions — backend seam, `DummyBackend` as permanent test double, `onProgress` callback threading, progress protocol — were made upfront and held throughout.

**Test coverage is real and meaningful.**
166 passing tests across 19 files. The CLI tests drive real dispatch paths through `DummyBackend`. Avoiding mocks of `dockerode` kept tests honest — the seam is the interface, not the SDK internals. At 59% of TypeScript lines (2,030 of 3,426 total), the ratio is healthy.

**Modules extracted correctly match the plan.**
`OutputHandler`, `LineWriter`, `OutputTracker`, `bootstrap-staging`, `scan-output`, `run-env`, `check-scripts` — each is small, focused, and has its own test file.

**The `demuxDockerStream` rewrite fixed real bugs.**
The original inline `Writable` blocks were silently dropping partial lines. The `LineWriter` extraction plan correctly diagnosed this and the fix applies consistently across both backends.

**The correction phase was itself productive.**
Once user feedback arrived, fixes were directional and stuck. The yargs migration, output handler unification, and module extraction all produced cleaner code than what they replaced. The correction phase improved the architecture, not just the bugs.

---

## Lacked — what was missing or broken

### Autonomous phase output was untested in practice

**The compiled binary was broken from the start.**
The `Bun.file()` fix (`b0c717c`) corrects a fundamental failure: `fs.copyFile()` does not work on embedded bunfs paths in a compiled Bun binary. Every unit test passed because tests run from source, where the OS can access the files. The binary — the actual deliverable — was non-functional. This was never caught because the build was never run as a binary.

**CLI argument parsing required a complete rewrite.**
The yargs migration (`cdedd4d` + `8c20a0b`) is not a refinement — it is a full replacement of the argument parsing approach. A separate plan had to be written for it. The original CLI worked well enough to pass unit tests (which call handler functions directly, bypassing argument parsing entirely) but failed when invoked from the command line.

**The output architecture was wrong.**
Three successive commits corrected the output flow: unified handler (`dd77474`), streaming all output to screen (`498ae20`), and waiting for writer finish events before resolving the Docker stream (`fdfde1b`). These aren't incremental improvements — the original output approach did not reliably deliver output to the terminal and lost data on stream close.

**The progress callback mechanism was incomplete across the interface.**
Three commits (`7557c36`, `836a107`, `89be28c`) threaded `ProgressCallback` properly through all backend methods and CLI handlers. The interface was defined with `onProgress` but it wasn't actually wired through — progress notifications were silently dropped in several code paths.

**PRD requirements shipped unimplemented.**
Req 5 (`outputFiles`), Req 6 (`progress()` helper), and Req 37 (`--output-dir`) required two new plans and 6 new source files to retrofit after the autonomous phase ended. These weren't edge cases — `outputFiles` is part of the `RunResult` return type.

**Integration failures only visible at runtime.**
- Docker build errors were silently swallowed (fixed `6722942`)
- `init.sh` step ordering was wrong — prerequisites installed after Node.js (`d0e7883`)
- Session directory passed to Docker as relative path — bind mounts require absolute paths (`4763a4c`)
- Init.sh Docker layer strategy required complete restructuring (`ff93df3`)

**CI was delivered but never ran.**
Commit `da09e8c` ("Add Phase 2: GitHub Actions CI workflow") added the workflow. The workflow targets `main`, but all work stayed on the feature branch — so CI never ran on any of this code. The CI phase was ticked off but provided no safety net.

### The test suite gave a false sense of completeness

Every unit test passed throughout the autonomous phase. This was structurally misleading. The tests validated that dispatch paths were correct — "does `imageCreate` call the right docker method?" — but not runtime behaviour:

- Tests run from source; the compiled binary was broken
- CLI tests call handler functions directly; the argument parser was wrong
- DummyBackend absorbs all calls; output routing was never exercised
- No integration test was run against Docker during development

Passing tests indicated correct wiring of abstractions. They said nothing about whether the tool actually worked.

---

## Longed for — what would have made this succeed

**Run the binary after building it.**
`bun run build && ./dist/sandy config` is a 10-second check. It would have caught the `Bun.file()` embedding failure immediately, before any further phases were built on top of a broken foundation.

**Acceptance criteria as the unit of work, not the commit.**
Each phase checkbox should have been verified by running the actual command, not by reading the code. The yargs rewrite, the output handler, and the progress threading were all problems that unit tests couldn't detect. A rule like "each acceptance criterion must be verified by running the CLI or binary, not by reading a test result" would have caught these in Phase 1.

**One integration test run per phase.**
`INTEGRATION=true bun test` after Phase 5 would have caught the Docker failures (silent error swallowing, relative path bind mount, stream data loss). The integration tests exist and are well-structured — they were just never run.

**Smaller trust radius for the autonomous phase.**
The autonomous phase accumulated 43 commits across all phases before the user ran the code. At that scale, failure modes compound and the correction cost rises. A more effective model: autonomous work produces a phase, user verifies it, autonomous work continues only after the gate clears. The correction phase would shrink from 32 commits to a handful per phase if failures were caught at each gate.

**The yargs migration signals a process failure, not a technical one.**
Writing a second plan for a complete rewrite of Phase 1's argument parsing is a symptom: the original work was accepted before anyone checked whether `sandy run --script foo.ts` actually worked. Any process that would have caught this — manual smoke test, integration test, CI on the branch — would have eliminated this entire rework track.

**Track runtime behaviour, not just structural correctness.**
The distinction between "tests pass" and "the tool works" needs to be explicit. A one-page test matrix covering: binary runs, each CLI subcommand accepts its flags, Docker image builds, container runs a script — checked manually or via integration test after each phase — would have surfaced the real state of the implementation far earlier.

---

## Summary

The autonomous phase produced code that looked complete: 43 commits, all tests green, all phases apparently delivered. In practice, the deliverable — the compiled binary, invoked from the command line, running a real container — was broken in multiple fundamental ways. The user had to discover this through use, then direct 32 further commits of corrections, several of which were full architectural rewrites rather than bug fixes.

The root cause is a gap between what the test suite measures and what the product requires. **Tests passing is not the same as the tool working.** The missing step at the end of every phase is: run it.

> **Core recommendation**: Gate each phase with a manual or scripted smoke test that runs the actual binary against the real CLI and (where available) the real backend. No phase is complete until someone has run the commands in the acceptance criteria and observed the correct output.

---

## Appendix: Context used in this retrospective

### Repository state at retrospective time

- Branch: `feature/sandy-rewrite`
- 75 commits ahead of `main`
- 19 modified files not staged; 12 new source files untracked
- Test results: 166 pass, 7 skip, 0 fail (173 tests across 19 files)
- Lines of code: 3,426 total TypeScript; 2,030 test lines (59%)

### Commit history — autonomous phase (`d2d579a` to `28e42fa`, 43 commits)

```
d2d579a Add Phase 1: Bun TypeScript project scaffold with full CLI and dummy backend
b4d192e Address Phase 1 review feedback
da09e8c Add Phase 2: GitHub Actions CI workflow
85ca2c1 Add Phase 3 bootstrap files for Shuru VM image
c4bacd1 imageExists: detect sandy checkpoint in shuru list output
7f30a8a imageExists: return false when sandy not found in list
89525d4 imageExists: reject checkpoint names containing sandy as substring
6598569 imageDelete: shell out to shuru checkpoint delete sandy
f5d6449 imageCreate: extract bootstrap files and shell out to shuru checkpoint create
f5f0a4b imageCreate: skip Netskope cert silently when cert file is absent
9cc019f run: start Shuru sandbox from sandy checkpoint
02e6834 run: mount script dir read-only and session dir read-write
b3aa6bd run: expose IMDS port and restrict network to AWS domains
1430e4e run: set IMDS endpoint and all AWS env vars including default region
61dadb9 run: spawn entrypoint with compiled script path and forwarded args
db91add run: parse [-->-prefixed lines as progress, forward via onProgress callback
68af7f2 run: collect stdout into RunResult, capture exit code, stop sandbox when done
89eb561 Wire ShuruBackend into CLI, add integration tests, fix lint warnings
e45742c mcp: slice 1 — sandy_run dispatches to backend, returns structured result
ad22838 mcp: slice 2 — verify session reused across sandy_run calls
c10feb3 mcp: slice 3 — sandy_resume_session sets active session name without validation
7e50747 mcp: slice 4 — progress lines forwarded via onProgress callback
2f82038 mcp: slice 5 — sandy_image create/delete dispatches to backend
9871ea0 mcp: slice 6 — sandy_check baseline/connect dispatches to backend
a90fb38 mcp: slices 7+8 — embed scripting-guide and example resources
2d20af9 mcp: slice 9 — wire MCP SDK server, cli/mcp.ts, and main.ts
a9a878c mcp: refactor — ProgressCallback type, await async onProgress in run
90b6f97 docker: slice 1 — imageExists returns true when sandy:latest inspect resolves
0d43578 docker: slice 2 — imageExists returns false when inspect throws
7c798fb docker: slice 3 — imageDelete calls remove on sandy:latest
0139518 docker: slice 4 — imageCreate calls buildImage with tag sandy:latest
925e69b docker: slice 5 — verify generateDockerfile() Dockerfile structure
999909a docker: slice 6 — run creates container with Image sandy:latest
b1b9dab docker: slice 7 — run sets IMDS endpoint to host.docker.internal
6cda20e docker: slice 8 — run sets all AWS env vars; defaults region to us-west-2
17a1cb1 docker: slice 9 — run mounts script dir (ro) and session dir (rw)
5eb9038 docker: slice 10 — run forwards [-->-prefixed stdout lines as progress
f45366e docker: slice 11 — run collects stdout into RunResult and captures exit code
1b565e1 docker: slice 12 — run removes container after exit; logs ID on non-zero exit
d1090de docker: slice 13 — wire DockerBackend into main.ts for docker config
92080ed docker: slice 14 — integration tests gated by INTEGRATION=true env var
353e9e7 docker: slice 15 — refactor: fix lint warnings, top-level Writable import
ed58bb4 docker: fix staging dir — use os.tmpdir() not .sandy/bootstrap/
74fe2ca docker: document no-network-restrictions trade-off in run()
0be5139 build: add build:all for multi-platform distribution binaries
2a1865b distribution: add Homebrew tap formula
f114b3e plugin: MCP-based plugin config and server registration
304c2b9 plugin: rewrite SKILL.md for MCP tools and resources
28e42fa refactor: apply biome format fix to skill.test.ts       ← boundary
```

### Commit history — user-guided correction phase (32 commits)

```
b0c717c fix: use Bun.file() to copy embedded bootstrap files in compiled binary
1aa97fe fix: use node:child_process spawn to avoid unsafe stream cast
e07d817 feat: add snapshot as synonym for image command
a52a5dd build: remove --minify to keep stack traces readable
6722942 fix: surface Docker build errors from imageCreate
d0e7883 fix: install prerequisites before Node.js download in init.sh
042bd52 feat: add AsyncDisposable makeTmpDir and use it in both backends
a2bf01e refactor: stream build context instead of buffering tar in memory
4763a4c fix: resolve session dir to absolute path for Docker bind mount
8e9cede chore: remove unused os import from docker-backend
cdedd4d plans: add yargs CLI migration plan
8c20a0b refactor: migrate CLI argument parsing to yargs
9fc9165 refactor: use switch for image action dispatch
b0bf271 fix: simplify entrypoint script
2158a90 chore: gitignore
cd209c2 build: use mise to install necessary bun tool
867f5f8 docs: original rewrite plans
ff93df3 refactor: modularise init.sh into step functions with per-step Dockerfile layers
dd77474 feat: unified output handler with stderr tee and [err] prefix
498ae20 fix: stream all subprocess output to screen via OutputHandler
fdfde1b fix: wait for writer finish events before resolving Docker log stream
7557c36 feat: add ProgressCallback to all Backend interface methods
836a107 feat: wire onProgress into ShuruBackend and DockerBackend image methods
89be28c feat: thread shared progress handler through CLI commands
176e694 docs: document output/progress design in CLAUDE.md
b403c3d docs: update CLAUDE.md to reflect current implementation state
661f50b feat: extract backend utility modules and add progress() bootstrap helper
b0b6a9b feat: wire utility modules into backends, replace demuxStream with manual multiplex parser
afd6dfe refactor: standardise CLI output handling through OutputHandler
6cf97a9 test: fix Docker integration test isolation and timeouts
fa4e060 chore: config and dependency updates
c77d910 chore: ignore sandbox bind-mount artifacts in gitignore
```

### Correction phase categorisation

| Category | Commits | Examples |
|----------|---------|---------|
| Architectural rewrites | 8 | Yargs migration, output handler, progress threading, module extraction, CLI standardisation |
| Binary/runtime correctness | 3 | `Bun.file()` embedding, stream cast, build context buffering |
| Integration failures | 4 | Docker error surfacing, init.sh ordering, absolute paths, init.sh restructuring |
| Missing infrastructure | 3 | mise tooling, `--minify` removal, snapshot synonym |
| Documentation / plans | 5 | CLAUDE.md, output/progress design, yargs plan, original rewrite plans |
| Chore / test fixes | 4 | gitignore, dependency updates, integration test isolation |
| Resource management | 1 | AsyncDisposable makeTmpDir |

### PRD requirements coverage status (at retrospective time)

| Req | Description | Status |
|-----|-------------|--------|
| 1–4 | Backend interface + streaming + progress | Done |
| 5 | `outputFiles` in `RunResult` | Done (retrofitted in correction phase) |
| 6 | `progress()` helper in bootstrap | Done (retrofitted in correction phase) |
| 7–11 | Shuru backend | Done (runtime correctness unverified) |
| 12–19 | Docker backend | Done — Req 19 entrypoint likely broken |
| 20–22 | Bootstrap / init.sh | Done |
| 23–28 | Session management | Done |
| 29–33 | Configuration | Done |
| 34–38 | CLI subcommands | Done; Req 37 `--output-dir` retrofitted |
| 39–43 | MCP server | Done |
| 44–49 | Script execution environment | Defined as constants; runtime unverified |
| 50–51 | Docker isolation trade-offs | Documented |
| 52–55 | Build + Biome | Done |
| 56–59 | Testing | Unit done; integration tests exist but unrun |
| 60–61 | CI (GitHub Actions) | Workflow added but never ran on branch |

### Source files reviewed

| File | Purpose |
|------|---------|
| `plans/prd-sandy-rewrite.md` | Original PRD (60 requirements) |
| `plans/sandy-rewrite.md` | 6-phase implementation plan with acceptance criteria |
| `plans/prd-remaining-requirements.md` | Retrofit plan for Req 5, 6, 37 |
| `plans/line-writer-extraction.md` | Refactor plan for `LineWriter` extraction |
| `src/docker-backend.ts` | Docker backend implementation |
| `src/shuru-backend.ts` | Shuru backend implementation |
| `src/session.ts` | Session creation and gitignore management |
| `src/bootstrap-staging.ts` | Bootstrap file embedding and staging |
| `src/scan-output.ts` | Output file tracking (snapshot diff) |
| `src/cli.test.ts` | CLI integration tests via DummyBackend |
| `src/mcp-server.ts` | MCP server implementation |
