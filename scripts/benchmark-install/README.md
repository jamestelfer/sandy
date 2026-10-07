# Docker dependency-install benchmark

Compare pnpm and Aube against Sandy's bootstrap dependencies. Use Docker; no host Node or Bun is required.
Run from the repository root on either computer.

```sh
docker build -t sandy-install-benchmark \
  -f scripts/benchmark-install/Dockerfile .
mkdir -p benchmark-results/default
docker run --rm --user "$(id -u):$(id -g)" \
  -v "${PWD}/benchmark-results/default:/results" \
  sandy-install-benchmark
```

The image pins Node 24, pnpm 12.9.1 and Aube 2.6.1. The image digest supports ARM64 and x86-64.
The shared `pnpm-lock.yaml` pins direct and transitive versions; both tools use it without conversion.
Production bootstrap files remain unchanged. See [RESULTS.md](RESULTS.md) for this machine's measurements.

## Measurements

Each repetition uses a fresh project, home directory and package-manager cache inside the container filesystem.
Only result files use the host bind mount. Three repetitions alternate tool order.

| Scenario | Starting state |
| --- | --- |
| `cold` | Frozen lockfile, empty package-manager caches, no `node_modules` |
| `warm` | Same lockfile and populated caches; remove `node_modules` after the cold install |
| `noop` | Keep the warm install and run install again |

Elapsed time includes the package-manager process, network requests, integrity checks and linking.
It excludes image construction, manager installation, project copying, cleanup and validation.
Both tools skip lifecycle scripts. The fixture has no install lifecycle script.

Every successful install must preserve the lockfile and match the installed package/version set.
Representative AWS clients, TypeScript and JMESPath must load successfully.
The package-set check does not prove identical dependency edges or complete runtime compatibility.

Inspect `summary.md` for medians and `results.json` for individual samples, versions, commands and machine metadata.
Each install has its own `.log` file. A ratio above 1 means Aube completed faster.
Failed commands stop the benchmark and leave logs and partial results.
Each install has a ten-minute timeout. Use a separate output directory for each profile; files are overwritten.

**Cold means empty tool caches, not empty kernel, DNS or upstream proxy caches.**
Network conditions affect cold timings. Run serially on an otherwise idle machine.
Docker Desktop uses its Linux VM, so results describe that VM and its storage.
Architecture-specific optional dependencies can differ between machines; comparisons happen within each run.

This is a frozen-install benchmark, not a complete image-build benchmark.
Sandy currently installs from `latest` without a lockfile; resolution time is deliberately excluded for reproducibility.
The checked-in lockfile corresponds to the current bootstrap manifest. Future manifest changes may require regenerating it.

## Configuration experiments

Pass extra install arguments through `PNPM_FLAGS` and `AUBE_FLAGS`. Arguments are whitespace-separated;
quoted values containing spaces are unsupported. All arguments are recorded in `results.json`.
Keep the frozen lockfile and lifecycle-script settings unchanged.

For example, trust the pinned lockfile in pnpm and start both tools at network concurrency 32:

```sh
mkdir -p benchmark-results/tuned
docker run --rm --user "$(id -u):$(id -g)" \
  -e PNPM_FLAGS='--trust-lockfile --network-concurrency=32' \
  -e AUBE_FLAGS='--network-concurrency=32' \
  -v "${PWD}/benchmark-results/tuned:/results" \
  sandy-install-benchmark
```

`--trust-lockfile` skips pnpm's supply-chain policy verification, reducing security work rather than simply tuning throughput.
It does not disable tarball integrity verification. Keep this profile labelled separately from the defaults.
Aube's network concurrency is an adaptive starting value; pnpm's value is a maximum, so these are not identical limits.

Set `-e RUNS=1` for a smoke run, or `-e RUNS=5` for more repetitions.
Use the same profiles and repetition count on the other computer.

## Harness test

```sh
docker run --rm --entrypoint node sandy-install-benchmark \
  --test benchmark.test.mjs
```

The small unit test checks median and ratio reporting. Running the benchmark itself exercises Docker, both managers and package loading.
