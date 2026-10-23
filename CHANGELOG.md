# Changelog

## [0.12.1](https://github.com/jamestelfer/sandy/compare/v0.12.0...v0.12.1) (2026-10-23)


### Bug Fixes

* **deps:** update dependency bun to v1.4.3 ([#72](https://github.com/jamestelfer/sandy/issues/72)) ([62ad5d6](https://github.com/jamestelfer/sandy/commit/62ad5d627f917309472d9c16421f93381f8e9aaa))
* **deps:** update dependency bun to v1.4.4 ([#79](https://github.com/jamestelfer/sandy/issues/79)) ([a084e92](https://github.com/jamestelfer/sandy/commit/a084e926c52b328b83dcfe98d02d0fd16a71bcb7))
* **deps:** update dependency go to v1.27.2 ([#69](https://github.com/jamestelfer/sandy/issues/69)) ([7a5b2f0](https://github.com/jamestelfer/sandy/commit/7a5b2f06b3d0c4a58b641695c5662ea92cecc198))
* **deps:** update dependency go to v1.27.3 ([#80](https://github.com/jamestelfer/sandy/issues/80)) ([0fb5e23](https://github.com/jamestelfer/sandy/commit/0fb5e239c00f4b9480db3de9726673fa04068697))
* **deps:** update dependency goreleaser to v2.18.3 ([#70](https://github.com/jamestelfer/sandy/issues/70)) ([a7450a2](https://github.com/jamestelfer/sandy/commit/a7450a26fa3d013a0c15fc8b2a770383c9d0e9e2))
* **deps:** update dependency goreleaser to v2.19.0 ([#81](https://github.com/jamestelfer/sandy/issues/81)) ([b510bac](https://github.com/jamestelfer/sandy/commit/b510bac147c3396debc7219412293cef55952e2a))
* **deps:** update jamestelfer/.github digest to 89f97c2 ([#78](https://github.com/jamestelfer/sandy/issues/78)) ([cd3e057](https://github.com/jamestelfer/sandy/commit/cd3e057f2ccda8dc062e685174dc41cf3c5bce78))

## [0.12.0](https://github.com/jamestelfer/sandy/compare/v0.11.0...v0.12.0) (2026-10-20)


### Features

* **sandbox:** add async iterator helpers and stream AWS results item-by-item ([#68](https://github.com/jamestelfer/sandy/issues/68)) ([4e50975](https://github.com/jamestelfer/sandy/commit/4e509755b7ca2aea178087477eff089ebaeb027b))


### Bug Fixes

* **ci:** publish a Nix recipe ([#74](https://github.com/jamestelfer/sandy/issues/74)) ([1bf2c6f](https://github.com/jamestelfer/sandy/commit/1bf2c6f0e20a1a68dac71c2217984111fa5b8f2c))
* **ci:** put imds-broker on sandy's PATH in the Nix recipe ([#75](https://github.com/jamestelfer/sandy/issues/75)) ([00cfa26](https://github.com/jamestelfer/sandy/commit/00cfa267e95c1b35351f747a46695241c3e1ae89))

## [0.11.0](https://github.com/jamestelfer/sandy/compare/v0.10.1...v0.11.0) (2026-10-09)


### Features

* **docker:** record Sandy version on image and add `image current` ([#65](https://github.com/jamestelfer/sandy/issues/65)) ([5b1cc53](https://github.com/jamestelfer/sandy/commit/5b1cc53bd1ccb3781f05d4936254793f24af41b5))

## [0.10.1](https://github.com/jamestelfer/sandy/compare/v0.10.0...v0.10.1) (2026-10-09)


### Bug Fixes

* **cli:** report package version from compiled binary ([#63](https://github.com/jamestelfer/sandy/issues/63)) ([6c95811](https://github.com/jamestelfer/sandy/commit/6c95811d71f23f2f4f1ae40fa653c8f212543a4f))

## [0.10.0](https://github.com/jamestelfer/sandy/compare/v0.9.0...v0.10.0) (2026-10-08)


### Features

* **sandbox:** add yaml package to sandbox workspace ([#61](https://github.com/jamestelfer/sandy/issues/61)) ([544ac22](https://github.com/jamestelfer/sandy/commit/544ac2206eca6183398bb3e6fa0369b9679f583c))

## [0.9.0](https://github.com/jamestelfer/sandy/compare/v0.8.1...v0.9.0) (2026-10-07)


### Features

* **sandbox:** install workspace dependencies with Aube instead of pnpm ([#59](https://github.com/jamestelfer/sandy/issues/59)) ([ea61685](https://github.com/jamestelfer/sandy/commit/ea6168555638ab0b5c82625d6ac235b96309e056))

## [0.8.1](https://github.com/jamestelfer/sandy/compare/v0.8.0...v0.8.1) (2026-10-07)


### Bug Fixes

* apply pnpm 12 security configuration during image creation ([#54](https://github.com/jamestelfer/sandy/issues/54)) ([f97cd86](https://github.com/jamestelfer/sandy/commit/f97cd86f55ad23e61ce71f27cf91a4ef1d8c2a0c))
* **deps:** update dependency bun to v1.4.2 ([#49](https://github.com/jamestelfer/sandy/issues/49)) ([ab47ac3](https://github.com/jamestelfer/sandy/commit/ab47ac357011e2c4b10df0ca24356e2c8e633efb))
* **deps:** update dependency go to v1.27.1 ([#50](https://github.com/jamestelfer/sandy/issues/50)) ([5247bb8](https://github.com/jamestelfer/sandy/commit/5247bb8766080f49e3282793fcd7274839612014))
* **deps:** update dependency typescript-language-server to v6 ([#53](https://github.com/jamestelfer/sandy/issues/53)) ([c9b9a67](https://github.com/jamestelfer/sandy/commit/c9b9a6714a619eaabfecb54f2d72bfdb6985c1c2))
* **deps:** update jamestelfer/.github digest to eff8850 ([#52](https://github.com/jamestelfer/sandy/issues/52)) ([5c23f15](https://github.com/jamestelfer/sandy/commit/5c23f1594dbaf4e5fe52c451050d51d09e2dcfb7))
* **deps:** update mise and bun dependencies, harden CI workflow ([#46](https://github.com/jamestelfer/sandy/issues/46)) ([d871bfe](https://github.com/jamestelfer/sandy/commit/d871bfed21fa1fca480a1729a16cebb0e2dfb788))
* replace deprecated Homebrew cask stanzas ([#47](https://github.com/jamestelfer/sandy/issues/47)) ([3719b2f](https://github.com/jamestelfer/sandy/commit/3719b2f7ed317649e7ba599ec640009ab2901c56))
* **test:** use application Docker endpoint resolution ([#55](https://github.com/jamestelfer/sandy/issues/55)) ([937db7b](https://github.com/jamestelfer/sandy/commit/937db7bb6f0275c9cc87bd4fa8294398855f465f))

## [0.8.0](https://github.com/jamestelfer/sandy/compare/v0.7.0...v0.8.0) (2026-08-04)


### Features

* publish sandy-mcp and sandy-cli as prime-bootstrap plugins ([#43](https://github.com/jamestelfer/sandy/issues/43)) ([63e7a1a](https://github.com/jamestelfer/sandy/commit/63e7a1a88ab1cfda7efbe9d76afaaf2df5b5fe6e))


### Bug Fixes

* **resources:** wait for extraction to fully settle before using embedded fs ([#44](https://github.com/jamestelfer/sandy/issues/44)) ([147f5ae](https://github.com/jamestelfer/sandy/commit/147f5ae890f62de261d586643e43bfb39177a5c4))

## [0.7.0](https://github.com/jamestelfer/sandy/compare/v0.6.2...v0.7.0) (2026-07-02)


### Features

* **sandbox:** resolve Docker endpoint from the selected docker context ([#38](https://github.com/jamestelfer/sandy/issues/38)) ([af88734](https://github.com/jamestelfer/sandy/commit/af88734eb1838b49b867a563177aab17b8c69b9d))

## [0.6.2](https://github.com/jamestelfer/sandy/compare/v0.6.1...v0.6.2) (2026-07-01)


### Bug Fixes

* **sandbox:** scope host.docker.internal alias to Linux ([#36](https://github.com/jamestelfer/sandy/issues/36)) ([2919915](https://github.com/jamestelfer/sandy/commit/29199155ca1be3b00fdd21862dd6443161a632cb))

## [0.6.1](https://github.com/jamestelfer/sandy/compare/v0.6.0...v0.6.1) (2026-06-30)


### Bug Fixes

* **ci:** fix npm provenance failures and harden release PR body ([#32](https://github.com/jamestelfer/sandy/issues/32)) ([4cc07bd](https://github.com/jamestelfer/sandy/commit/4cc07bdde7390de8e7cd78af1078666909146dd9))
* **prime:** make CLI skill output resistant to agent truncation ([#33](https://github.com/jamestelfer/sandy/issues/33)) ([b3e163e](https://github.com/jamestelfer/sandy/commit/b3e163e05404f7ede3b5aada0b38292d9e369aec))

## [0.6.0](https://github.com/jamestelfer/sandy/compare/v0.5.0...v0.6.0) (2026-06-30)


### Features

* default backend to Docker over Shuru ([#30](https://github.com/jamestelfer/sandy/issues/30)) ([e18a563](https://github.com/jamestelfer/sandy/commit/e18a563f2d4e441d56b86a7f38de187639596b0a))
