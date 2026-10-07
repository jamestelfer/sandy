# Raspberry Pi results

## Environment

- Measured on 7 October 2026, sequentially: defaults first, tuned second.
- Four Cortex-A76 cores, ARM64, approximately 8 GB RAM.
- Linux `6.6.51+rpt-rpi-2712`, Debian 12.
- Docker 28.0.0, `overlay2`; host root filesystem on `/dev/mmcblk0p2`.
- Node `v24.21.0`, pnpm `12.9.1`, Aube `2.6.1 linux-arm64`.
- No explicit Docker CPU or memory limits. Existing host service containers remained running; background load was not controlled.
- Three repetitions per profile, alternating manager order.
- Every install matched 234 package/version entries and passed the representative import checks.
- Manifest SHA-256: `5cb8958bdfe03fc68b4fa45cb6d70b90dd0f30b78a8380edcb76db28ecf1e7bc`.
- Lockfile SHA-256: `cbb80d04288d548a2c2a02dc5099223dba2d4d77e80977ad1175bd9ed15a057c`.

## Medians

| Profile | Scenario | pnpm (s) | Aube (s) | pnpm / Aube |
| --- | --- | ---: | ---: | ---: |
| Default | Cold | 185.016 | 44.535 | 4.15x |
| Default | Warm store | 37.811 | 24.459 | 1.55x |
| Default | No-op | 0.056 | 0.009 | 6.30x |
| Tuned | Cold | 72.995 | 39.291 | 1.86x |
| Tuned | Warm store | 12.632 | 12.755 | 0.99x |
| Tuned | No-op | 0.052 | 0.016 | 3.15x |

Both profiles use `install --frozen-lockfile --ignore-scripts --reporter=append-only`.
The tuned profile adds `--trust-lockfile --network-concurrency=32` for pnpm and `--network-concurrency=32` for Aube.

`--trust-lockfile` skips pnpm's supply-chain policy verification. Its security work differs from the default profile.
Tarball integrity verification remains enabled. Aube's concurrency setting is adaptive; pnpm's is a maximum.

## Individual samples

All times are seconds. Tool order is pnpm then Aube in repetitions 1 and 3; repetition 2 reverses that order.

| Profile | Repetition | Tool | Cold | Warm store | No-op |
| --- | ---: | --- | ---: | ---: | ---: |
| Default | 1 | pnpm | 204.990 | 42.369 | 0.057 |
| Default | 1 | Aube | 34.857 | 18.101 | 0.009 |
| Default | 2 | pnpm | 185.016 | 37.811 | 0.056 |
| Default | 2 | Aube | 44.535 | 42.729 | 0.009 |
| Default | 3 | pnpm | 180.214 | 4.512 | 0.054 |
| Default | 3 | Aube | 50.046 | 24.459 | 0.009 |
| Tuned | 1 | pnpm | 72.995 | 12.632 | 0.052 |
| Tuned | 1 | Aube | 38.747 | 22.341 | 0.023 |
| Tuned | 2 | pnpm | 39.641 | 31.274 | 0.053 |
| Tuned | 2 | Aube | 54.456 | 2.442 | 0.009 |
| Tuned | 3 | pnpm | 79.935 | 2.830 | 0.052 |
| Tuned | 3 | Aube | 39.291 | 12.755 | 0.016 |

## Interpretation

Aube completed cold installs faster in both profiles on this machine.
The tuned warm-store medians are effectively tied, with substantial variation in both tools.
Warm-store samples range from roughly 2 to 43 seconds; three samples do not establish a stable storage-performance ranking.
No-op differences are measured in milliseconds and are insignificant for image creation.

The tuned profile improves pnpm's cold median, but changes two settings simultaneously.
These measurements do not isolate the effect of policy checks from concurrency or changing network conditions.
Cold timings include registry access; they are not pure CPU or filesystem benchmarks.
They exclude latest-version resolution and do not measure Sandy's complete image build.

Raw JSON and command logs remain in the ignored local directories `benchmark-results/default/` and `benchmark-results/tuned/`.
Run the commands in [README.md](README.md) on the other computer before drawing cross-machine conclusions.
