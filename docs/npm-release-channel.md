# npm release channel — implementation brief for chinmina/.github

## Audience

An agent implementing npm publishing inside the `chinmina/.github` repository.
This brief describes the change in chinmina's terms: its reusable workflows,
composite actions, requirement IDs, and pinning conventions. Sandy
(`jamestelfer/sandy`) is the reference consumer.

## Where the change lands

```
.github/workflows/goreleaser-release.yml      # add the npm channel here
.github/workflows/release-please.yml          # unaffected
.github/actions/setup-release-toolchain/      # existing pattern to mirror
.github/actions/binstaller-install-script/    # existing channel action to mirror
.github/actions/attest-artifacts/             # attestation; precedes publish
.github/actions/npm-publish/                   # NEW composite action
docs/adopting-the-release-pipeline.md         # document the new channel + inputs
```

Conventions to honour:

- Pin every third-party action to a full commit SHA with a trailing version
  comment (e.g. `octo-sts/action@a26b0c6...` `# v1.0.2`).
- Reference chinmina's own actions at `@verified-actions`.
- Gate optional channels with a `disable-<channel>` boolean, mirroring
  `disable-binstaller` and `disable-homebrew` (R13).
- Tag new behaviour with requirement IDs and add them to the requirements set.

## Objective

Add a generic, opt-in npm channel to `goreleaser-release.yml`. Publish the
consumer's npm packages from `dist/` using npm trusted publishing (OIDC),
without storing a registry token. Generate npm provenance.

## The make-or-break question: which OIDC claim does npm match?

Resolve this with a spike before building. It determines the whole design.

In a reusable-workflow call, the GitHub OIDC token carries:

- `workflow_ref` / `workflow` — the **caller** workflow (consumer `release.yml`).
- `job_workflow_ref` — the **reusable** workflow
  (`chinmina/.github/.github/workflows/goreleaser-release.yml@verified-actions`).

npm trusted publishing is configured per package with a repository, a workflow
filename, and an optional environment.

- **If npm matches `workflow_ref` (caller):** publishing from inside the
  reusable workflow works. Consumers register `release.yml` against their own
  repo. This matches the adoption guide's filename contract. Build the channel
  inside `goreleaser-release.yml` (Design A below).
- **If npm matches `job_workflow_ref` (reusable):** publishing from inside the
  reusable workflow would force every consumer to register
  `chinmina/.github`'s workflow as their publisher — unacceptable for a shared
  workflow. The npm publish must then run in the **consumer's own job**, not in
  the reusable workflow (Design B below).

Run the spike: a throwaway package, trusted publisher set to the consumer repo
+ `release.yml`, publish once from inside the reusable workflow. If it succeeds,
adopt Design A. The adoption guide asserts Design A ("npm trusted publishing
validates the caller workflow filename"); verify before committing to it.

## Design A — npm channel inside goreleaser-release.yml (preferred)

### New inputs (`workflow_call.inputs`)

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `disable-npm` | boolean | `true` | Skip npm publication (R13). Default off during rollout; consumers opt in. |
| `npm-publish-script` | string | `.github/workflows/npm/publish.sh` | Consumer script that publishes packages from `dist/`. Receives the tag as `$1`. |
| `npm-node-version` | string | `lts/*` | Node version for the publish step. |

No new secrets. Trusted publishing needs no stored token. Keep
`permissions: id-token: write` on the `release` job (already present for
attestation).

### New composite action: `.github/actions/npm-publish`

Mirror `binstaller-install-script` in shape.

Inputs: `script`, `version`, `node-version`.

Steps:
1. `actions/setup-node@<sha>` with `registry-url: https://registry.npmjs.org`
   and `node-version: ${{ inputs.node-version }}`.
2. Ensure npm is recent enough for OIDC trusted publishing; `npm install -g npm@latest`
   if the runner's npm predates it.
3. Run `bash "${SCRIPT}" "${VERSION}"` with `SCRIPT`/`VERSION` passed as env to
   avoid template injection (follow the R15 pre-build precedent). Do **not** set
   `NODE_AUTH_TOKEN`; trusted publishing supplies credentials.

### Workflow wiring

Add one step to the `release` job, after **Attest artifacts** and before
**Publish release**. Rationale: `dist/` must exist (after goreleaser build),
and the GitHub release should flip out of draft last (R10). npm provenance is
produced by npm itself, independent of the GitHub artifact attestation.

```yaml
- name: Publish npm packages
  if: ${{ !inputs.disable-npm }}
  uses: chinmina/.github/.github/actions/npm-publish@verified-actions
  with:
    script: ${{ inputs.npm-publish-script }}
    version: ${{ env.TAG }}
    node-version: ${{ inputs.npm-node-version }}
```

Order in the `release` job becomes: checkout → setup-release-toolchain →
pre-build → mint release-token → mint tap-token → require use_existing_draft →
goreleaser build → generate install script → attest artifacts → **publish npm**
→ publish release.

### Preconditions

Add a validation step alongside the existing `use_existing_draft` gate:

- When `!disable-npm`, assert the `npm-publish-script` file exists and is
  executable; fail with an actionable `::error::` otherwise.
- Trusted-publisher configuration on npmjs cannot be validated from CI.
  Document it as a consumer prerequisite.

## Design B — consumer-side npm job (fallback if the spike picks job_workflow_ref)

Do not publish npm from the reusable workflow. Instead, ship a second reusable
workflow `npm-publish.yml` that the consumer references from its **own**
`release.yml` as a sibling job, so `workflow_ref` resolves to the consumer.
Alternatively, document a copy-paste job for `release.yml`. The reusable
release job does not expose `dist/` to the caller, so this job rebuilds the
archives with `goreleaser release --clean --skip=publish,announce`, then runs
the publish script. Accept the duplicate build as the cost of the OIDC claim.

## Consumer contract

Document these in the adoption guide.

- **Publish script.** Consumer commits a script that publishes from `dist/`,
  taking the tag as `$1` (leading `v` stripped inside). Sandy's reference:
  `.github/workflows/npm/publish.sh`, which publishes one main package plus
  four platform packages.
- **Trusted publishers.** Configure each package on npmjs.com against the
  consumer repo, workflow `release.yml`, and (if used) the `release`
  environment. Configure every package, including platform packages.
- **Prereleases.** Tags containing `-` publish under the `next` dist-tag. The
  publish script branches on the version string.
- **Provenance.** With trusted publishing, npm attaches provenance
  automatically. Add `--provenance` explicitly only if a pinned npm requires it.
- **Filename contract.** The caller workflow stays `release.yml`. Restate this
  next to the channel docs.

## Attestation and provenance

Two independent provenance trails coexist:

- GitHub artifact attestation over `dist/checksums.txt` and `install.sh`,
  produced by `attest-artifacts` before the GitHub release publishes (R28–R30).
- npm provenance over the published tarballs, produced by npm during
  `npm publish` under OIDC.

Do not route npm artifacts through `attest-artifacts`; npm owns that trail.

## Requirement IDs to add

Propose and record:

- **R31 npm channel** — opt-in npm publication gated by `disable-npm`.
- **R32 npm trusted publishing** — no stored token; OIDC only.
- **R33 npm provenance** — provenance attached to published packages.
- **R34 caller filename contract** — npm publishes only under the consumer's
  `release.yml`.

Cross-reference R13 (channel skip flags) and R10 (publish ordering).

## Tests

- Extend the workflow test harness with a `disable-npm` matrix entry asserting
  the npm step is skipped when disabled and present when enabled.
- Add a precondition test: missing/non-executable `npm-publish-script` fails
  fast when `!disable-npm`.
- The spike (trusted-publishing claim) is manual; record its outcome in the PR.

## Reference consumer: sandy

- Packages: `@jamestelfer/sandy` (shim + `optionalDependencies`) and
  `@jamestelfer/sandy-{linux,darwin}-{x64,arm64}` (binary each).
- Launcher: `.github/workflows/npm/main/bin/sandy.js` selects the platform
  package by `process.platform`/`process.arch`.
- Archive/arch naming: `sandy-<version>-<os>-<arch>.tar.gz`, amd64 → `x64`,
  matching `.goreleaser.yaml` and `.config/binstaller.yml`.
- Retained `publish.sh` is registry-agnostic; it needs no token under trusted
  publishing. Verify the main package's `optionalDependencies` versions are
  substituted to the release version alongside its own `version`.

Sandy enables the channel once Design A lands:

```yaml
with:
  token-source: octo-sts
  disable-binstaller: false
  disable-homebrew: false
  disable-npm: false
```

## Acceptance criteria

- A `v*` tag on a consumer publishes all configured packages at the tag version.
- A prerelease tag publishes under `next`.
- Published packages carry npm provenance.
- No npm token is stored anywhere.
- Disabled is the default; existing consumers are unaffected.
- The GitHub release still flips out of draft last (R10 preserved).
- The caller workflow remains `release.yml`.

## Open questions

1. OIDC claim matched by npm (the spike). Gate Design A/B on the answer.
2. Default for `disable-npm`: keep `true` until npm GA is broadly adopted, then
   reconsider flipping to `false` for parity with binstaller/homebrew.
3. Whether to offer a declarative `.config/npm.yml` instead of a publish
   script, generating publication from a spec as binstaller does.
