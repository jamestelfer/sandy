# Changelog

## [0.12.0](https://github.com/jamestelfer/sandy/compare/v0.11.0...v0.12.0) (2026-10-09)


### Features

* add plain-text logger for MCP server ([d0811af](https://github.com/jamestelfer/sandy/commit/d0811af8077c08ac633cdc59fbd77e3eaf2a3352))
* add plain-text logger for MCP server ([c3e1217](https://github.com/jamestelfer/sandy/commit/c3e12179ef6bd46a9535e87d7f9b54729712d591))
* default backend to Docker over Shuru ([#30](https://github.com/jamestelfer/sandy/issues/30)) ([e18a563](https://github.com/jamestelfer/sandy/commit/e18a563f2d4e441d56b86a7f38de187639596b0a))
* **docker:** record Sandy version on image and add `image current` ([#65](https://github.com/jamestelfer/sandy/issues/65)) ([5b1cc53](https://github.com/jamestelfer/sandy/commit/5b1cc53bd1ccb3781f05d4936254793f24af41b5))
* embed Sandy skill resources and expose prime/resource interfaces ([#9](https://github.com/jamestelfer/sandy/issues/9)) ([0ef305e](https://github.com/jamestelfer/sandy/commit/0ef305ed0df3b061d6ed80d8ba243e0e081eda9e))
* improve create image speed via layer caching ([#2](https://github.com/jamestelfer/sandy/issues/2)) ([3bc7764](https://github.com/jamestelfer/sandy/commit/3bc77643e8dda25b7e6e89ad732d7276aedddeeb))
* log MCP client version and capabilities on initialize ([a013c41](https://github.com/jamestelfer/sandy/commit/a013c41b6cb206b3277df8232aafd8f89167b78d))
* publish sandy-mcp and sandy-cli as prime-bootstrap plugins ([#43](https://github.com/jamestelfer/sandy/issues/43)) ([63e7a1a](https://github.com/jamestelfer/sandy/commit/63e7a1a88ab1cfda7efbe9d76afaaf2df5b5fe6e))
* research prompt framework (phases 1–3) ([#23](https://github.com/jamestelfer/sandy/issues/23)) ([fb2e4d7](https://github.com/jamestelfer/sandy/commit/fb2e4d70871662e2403ccc6c094abea4194b09d2))
* **sandbox:** add yaml package to sandbox workspace ([#61](https://github.com/jamestelfer/sandy/issues/61)) ([544ac22](https://github.com/jamestelfer/sandy/commit/544ac2206eca6183398bb3e6fa0369b9679f583c))
* **sandbox:** install workspace dependencies with Aube instead of pnpm ([#59](https://github.com/jamestelfer/sandy/issues/59)) ([ea61685](https://github.com/jamestelfer/sandy/commit/ea6168555638ab0b5c82625d6ac235b96309e056))
* **sandbox:** resolve Docker endpoint from the selected docker context ([#38](https://github.com/jamestelfer/sandy/issues/38)) ([af88734](https://github.com/jamestelfer/sandy/commit/af88734eb1838b49b867a563177aab17b8c69b9d))
* **session:** clean up stale empty session directories on workdir establish ([#24](https://github.com/jamestelfer/sandy/issues/24)) ([3ee64be](https://github.com/jamestelfer/sandy/commit/3ee64be43393e1167139b5b54972e26ce694e948))
* **session:** implement session redesign ([#16](https://github.com/jamestelfer/sandy/issues/16)) ([e670dac](https://github.com/jamestelfer/sandy/commit/e670dacc2382eb9b059555491791bf44a745c7db))
* **skills:** add research prompt framework with modes, evidence ledger, and Cost Explorer ([fb2e4d7](https://github.com/jamestelfer/sandy/commit/fb2e4d70871662e2403ccc6c094abea4194b09d2))


### Bug Fixes

* apply pnpm 12 security configuration during image creation ([#54](https://github.com/jamestelfer/sandy/issues/54)) ([f97cd86](https://github.com/jamestelfer/sandy/commit/f97cd86f55ad23e61ce71f27cf91a4ef1d8c2a0c))
* bring proper baseline checks across from original script ([008fd94](https://github.com/jamestelfer/sandy/commit/008fd946d2d237f9bab01c7485a489c2c389c64a))
* **ci:** fix npm provenance failures and harden release PR body ([#32](https://github.com/jamestelfer/sandy/issues/32)) ([4cc07bd](https://github.com/jamestelfer/sandy/commit/4cc07bdde7390de8e7cd78af1078666909146dd9))
* **cli:** prevent numeric coercion of script args ([#14](https://github.com/jamestelfer/sandy/issues/14)) ([2bdc48a](https://github.com/jamestelfer/sandy/commit/2bdc48a28cf8ab0f9e3918f1a6e447401bc77bc2))
* **cli:** report package version from compiled binary ([#63](https://github.com/jamestelfer/sandy/issues/63)) ([6c95811](https://github.com/jamestelfer/sandy/commit/6c95811d71f23f2f4f1ae40fa653c8f212543a4f))
* **deps:** update dependency bun to v1.4.2 ([#49](https://github.com/jamestelfer/sandy/issues/49)) ([ab47ac3](https://github.com/jamestelfer/sandy/commit/ab47ac357011e2c4b10df0ca24356e2c8e633efb))
* **deps:** update dependency go to v1.27.1 ([#50](https://github.com/jamestelfer/sandy/issues/50)) ([5247bb8](https://github.com/jamestelfer/sandy/commit/5247bb8766080f49e3282793fcd7274839612014))
* **deps:** update dependency typescript-language-server to v6 ([#53](https://github.com/jamestelfer/sandy/issues/53)) ([c9b9a67](https://github.com/jamestelfer/sandy/commit/c9b9a6714a619eaabfecb54f2d72bfdb6985c1c2))
* **deps:** update jamestelfer/.github digest to eff8850 ([#52](https://github.com/jamestelfer/sandy/issues/52)) ([5c23f15](https://github.com/jamestelfer/sandy/commit/5c23f1594dbaf4e5fe52c451050d51d09e2dcfb7))
* **deps:** update mise and bun dependencies, harden CI workflow ([#46](https://github.com/jamestelfer/sandy/issues/46)) ([d871bfe](https://github.com/jamestelfer/sandy/commit/d871bfed21fa1fca480a1729a16cebb0e2dfb788))
* **prime:** make CLI skill output resistant to agent truncation ([#33](https://github.com/jamestelfer/sandy/issues/33)) ([b3e163e](https://github.com/jamestelfer/sandy/commit/b3e163e05404f7ede3b5aada0b38292d9e369aec))
* replace deprecated Homebrew cask stanzas ([#47](https://github.com/jamestelfer/sandy/issues/47)) ([3719b2f](https://github.com/jamestelfer/sandy/commit/3719b2f7ed317649e7ba599ec640009ab2901c56))
* resign compiled binary to work around bun adhoc signature ([3d9aab4](https://github.com/jamestelfer/sandy/commit/3d9aab45946ae016fc575889952cc2b30cdc900b))
* **resources:** wait for extraction to fully settle before using embedded fs ([#44](https://github.com/jamestelfer/sandy/issues/44)) ([147f5ae](https://github.com/jamestelfer/sandy/commit/147f5ae890f62de261d586643e43bfb39177a5c4))
* **sandbox:** scope host.docker.internal alias to Linux ([#36](https://github.com/jamestelfer/sandy/issues/36)) ([2919915](https://github.com/jamestelfer/sandy/commit/29199155ca1be3b00fdd21862dd6443161a632cb))
* **test:** use application Docker endpoint resolution ([#55](https://github.com/jamestelfer/sandy/issues/55)) ([937db7b](https://github.com/jamestelfer/sandy/commit/937db7bb6f0275c9cc87bd4fa8294398855f465f))
* too many hypens on shuru backend ([81f3be0](https://github.com/jamestelfer/sandy/commit/81f3be0af03424dfb5b3ef0c5574f8b17f40a3d8))

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
