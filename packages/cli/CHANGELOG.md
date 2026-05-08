# @medalsocial/pilot

## 0.2.5

### Patch Changes

- [#109](https://github.com/Medal-Social/Pilot/pull/109) [`9192136`](https://github.com/Medal-Social/Pilot/commit/9192136a5580698d23e4073270ed53f1deaf08b3) Thanks [@alioftech](https://github.com/alioftech)! - Update dependencies to latest and remove dependency bot automation.

## 0.2.4

### Patch Changes

- [#93](https://github.com/Medal-Social/Pilot/pull/93) [`a99a9ee`](https://github.com/Medal-Social/Pilot/commit/a99a9ee536a109395f6bd381861a4b915d17959d) Thanks [@alioftech](https://github.com/alioftech)! - back-merge prod into dev

  Refs: [#67](https://github.com/Medal-Social/Pilot/issues/67)

- [#93](https://github.com/Medal-Social/Pilot/pull/93) [`a99a9ee`](https://github.com/Medal-Social/Pilot/commit/a99a9ee536a109395f6bd381861a4b915d17959d) Thanks [@alioftech](https://github.com/alioftech)! - chore(deps): bulk-bump dependencies to latest. Notable: `ink` 7.0.0 → 7.0.1 (runtime), `@biomejs/biome` 2.4.12 → 2.4.13, `secretlint` 9.3.4 → 12.3.1 (major), `typescript` 6.0.2 → 6.0.3, `vitest` 4.1.4 → 4.1.5, plus changesets/cli, knip, lint-staged, commitlint, coverage-v8.

- [#93](https://github.com/Medal-Social/Pilot/pull/93) [`a99a9ee`](https://github.com/Medal-Social/Pilot/commit/a99a9ee536a109395f6bd381861a4b915d17959d) Thanks [@alioftech](https://github.com/alioftech)! - chore: dependency hygiene — drop unused `ink-text-input` from cli runtime deps, consolidate `react-devtools-core` to a single declaration (devDep only, removing the duplicate CI install step), pin `typescript` and `vitest` exactly in the kit workspace to match root, add a `commitlint-pr-title` CI gate so non-conventional PR titles fail before merge, and fix the stale build-pipeline note in CLAUDE.md.

- [#93](https://github.com/Medal-Social/Pilot/pull/93) [`a99a9ee`](https://github.com/Medal-Social/Pilot/commit/a99a9ee536a109395f6bd381861a4b915d17959d) Thanks [@alioftech](https://github.com/alioftech)! - fix(ci): make Windows binary build work and stop matrix fail-fast from skipping uploads. Replace `inject-version.sh` with a portable Node ESM script (works on Windows git-bash where POSIX path translation breaks `node -p`), set `fail-fast: false` on the binary matrix, and let `upload-release` run on partial matrix success so single-target failures no longer skip publishing assets to the release.

- [#93](https://github.com/Medal-Social/Pilot/pull/93) [`a99a9ee`](https://github.com/Medal-Social/Pilot/commit/a99a9ee536a109395f6bd381861a4b915d17959d) Thanks [@alioftech](https://github.com/alioftech)! - Reliability and governance improvements: deterministic release automation with an AI fallback, a two-channel release pipeline, and auto-merge for routine dependency and release updates.

- [#93](https://github.com/Medal-Social/Pilot/pull/93) [`a99a9ee`](https://github.com/Medal-Social/Pilot/commit/a99a9ee536a109395f6bd381861a4b915d17959d) Thanks [@alioftech](https://github.com/alioftech)! - Install experience and release pipeline fixes:

  - The one-line install always grabs the current Pilot release, not a stale cache.
  - Release downloads now include prebuilt binaries for macOS (Intel + Apple Silicon), Linux (x64 + arm64), and Windows.
  - Routine promotions from the dev channel to prod run on a schedule without manual effort.

## 0.2.3

### Patch Changes

- [#86](https://github.com/Medal-Social/Pilot/pull/86) [`8676efd`](https://github.com/Medal-Social/Pilot/commit/8676efd4bc74149af66f62da8f5c70ccd6ac1c0f) Thanks [@alioftech](https://github.com/alioftech)! - back-merge prod into dev

  Refs: [#67](https://github.com/Medal-Social/Pilot/issues/67)

- [#86](https://github.com/Medal-Social/Pilot/pull/86) [`8676efd`](https://github.com/Medal-Social/Pilot/commit/8676efd4bc74149af66f62da8f5c70ccd6ac1c0f) Thanks [@alioftech](https://github.com/alioftech)! - chore(deps): bulk-bump dependencies to latest. Notable: `ink` 7.0.0 → 7.0.1 (runtime), `@biomejs/biome` 2.4.12 → 2.4.13, `secretlint` 9.3.4 → 12.3.1 (major), `typescript` 6.0.2 → 6.0.3, `vitest` 4.1.4 → 4.1.5, plus changesets/cli, knip, lint-staged, commitlint, coverage-v8.

- [#86](https://github.com/Medal-Social/Pilot/pull/86) [`8676efd`](https://github.com/Medal-Social/Pilot/commit/8676efd4bc74149af66f62da8f5c70ccd6ac1c0f) Thanks [@alioftech](https://github.com/alioftech)! - chore: dependency hygiene — drop unused `ink-text-input` from cli runtime deps, consolidate `react-devtools-core` to a single declaration (devDep only, removing the duplicate CI install step), pin `typescript` and `vitest` exactly in the kit workspace to match root, add a `commitlint-pr-title` CI gate so non-conventional PR titles fail before merge, and fix the stale build-pipeline note in CLAUDE.md.

- [#86](https://github.com/Medal-Social/Pilot/pull/86) [`8676efd`](https://github.com/Medal-Social/Pilot/commit/8676efd4bc74149af66f62da8f5c70ccd6ac1c0f) Thanks [@alioftech](https://github.com/alioftech)! - fix(ci): make Windows binary build work and stop matrix fail-fast from skipping uploads. Replace `inject-version.sh` with a portable Node ESM script (works on Windows git-bash where POSIX path translation breaks `node -p`), set `fail-fast: false` on the binary matrix, and let `upload-release` run on partial matrix success so single-target failures no longer skip publishing assets to the release.

- [#86](https://github.com/Medal-Social/Pilot/pull/86) [`8676efd`](https://github.com/Medal-Social/Pilot/commit/8676efd4bc74149af66f62da8f5c70ccd6ac1c0f) Thanks [@alioftech](https://github.com/alioftech)! - Reliability and governance improvements: deterministic release automation with an AI fallback, a two-channel release pipeline, and auto-merge for routine dependency and release updates.

- [#86](https://github.com/Medal-Social/Pilot/pull/86) [`8676efd`](https://github.com/Medal-Social/Pilot/commit/8676efd4bc74149af66f62da8f5c70ccd6ac1c0f) Thanks [@alioftech](https://github.com/alioftech)! - Install experience and release pipeline fixes:

  - The one-line install always grabs the current Pilot release, not a stale cache.
  - Release downloads now include prebuilt binaries for macOS (Intel + Apple Silicon), Linux (x64 + arm64), and Windows.
  - Routine promotions from the dev channel to prod run on a schedule without manual effort.

## 0.2.2

### Patch Changes

- [#65](https://github.com/Medal-Social/Pilot/pull/65) [`0379f1f`](https://github.com/Medal-Social/Pilot/commit/0379f1f1ffaff2b2fc02194e429ed9b876313ef9) Thanks [@alioftech](https://github.com/alioftech)! - back-merge prod into dev

  Refs: [#67](https://github.com/Medal-Social/Pilot/issues/67)

- [#65](https://github.com/Medal-Social/Pilot/pull/65) [`0379f1f`](https://github.com/Medal-Social/Pilot/commit/0379f1f1ffaff2b2fc02194e429ed9b876313ef9) Thanks [@alioftech](https://github.com/alioftech)! - Reliability and governance improvements: deterministic release automation with an AI fallback, a two-channel release pipeline, and auto-merge for routine dependency and release updates.

- [#65](https://github.com/Medal-Social/Pilot/pull/65) [`0379f1f`](https://github.com/Medal-Social/Pilot/commit/0379f1f1ffaff2b2fc02194e429ed9b876313ef9) Thanks [@alioftech](https://github.com/alioftech)! - Install experience and release pipeline fixes:

  - The one-line install always grabs the current Pilot release, not a stale cache.
  - Release downloads now include prebuilt binaries for macOS (Intel + Apple Silicon), Linux (x64 + arm64), and Windows.
  - Routine promotions from the dev channel to prod run on a schedule without manual effort.

## 0.2.1

### Patch Changes

- [#60](https://github.com/Medal-Social/Pilot/pull/60) [`8ec036b`](https://github.com/Medal-Social/Pilot/commit/8ec036b94a3dd3648d36fed91cb9f52ae995091f) Thanks [@alioftech](https://github.com/alioftech)! - Internal improvements: deterministic changeset automation with AI fallback, two-branch governance (dev → prod), auto-merge for dependency and release bot PRs, updated developer toolchain (biome 2.4.12, knip 6, secretlint 12, fast-check 4.7).

## 0.2.0

### Minor Changes

- [#41](https://github.com/Medal-Social/Pilot/pull/41) [`4d2c815`](https://github.com/Medal-Social/Pilot/commit/4d2c81557dd900d292ddc185238284e243ff086f) Thanks [@alioftech](https://github.com/alioftech)! - Add `pilot usage` command to display per-model token usage and costs for Claude Code and Codex CLI sessions. Supports filtering by week, month, or custom date, and outputs in table or JSON format. No API calls required; reads from local session files.

## 0.1.8

### Patch Changes

- [#35](https://github.com/Medal-Social/Pilot/pull/35) [`b4e82e0`](https://github.com/Medal-Social/Pilot/commit/b4e82e09c1580d9d4727c9d73f2e911fd86a9c80) Thanks [@alioftech](https://github.com/alioftech)! - Fix binary build workflow to trigger on release publish, not v\* tags. Add continue-on-error for auto-merge.

## 0.1.7

### Patch Changes

- Updated dependencies [[`e360e20`](https://github.com/Medal-Social/Pilot/commit/e360e2059ee2cbc865dd4c400f9fed44635754db)]:
  - @medalsocial/kit@0.1.2

## 0.1.6

### Patch Changes

- [#17](https://github.com/Medal-Social/Pilot/pull/17) [`6ddcd72`](https://github.com/Medal-Social/Pilot/commit/6ddcd72243beadb404384257a70af53809bdd806) Thanks [@alioftech](https://github.com/alioftech)! - Add repository guardrails for AI-assisted changes, security scanning, and release discipline.

  This adds Changesets-based release automation, stricter contributor hooks, tracked-file secret scanning,
  Knip baseline reporting, and tighter published package metadata.

- Updated dependencies [[`6ddcd72`](https://github.com/Medal-Social/Pilot/commit/6ddcd72243beadb404384257a70af53809bdd806)]:
  - @medalsocial/kit@0.1.1
