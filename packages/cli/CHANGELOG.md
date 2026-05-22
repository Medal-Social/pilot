# @medalsocial/pilot

## 0.7.1

### Patch Changes

- [#156](https://github.com/Medal-Social/Pilot/pull/156) [`72ce66a`](https://github.com/Medal-Social/Pilot/commit/72ce66ad9b5cff5661e71044a1f313f028901299) Thanks [@alioftech](https://github.com/alioftech)! - Pilot now correctly identifies the active machine when its hostname matches a configured machine name, in addition to the built-in pattern map. Fixes a silent fallback where Pilot would route commands to the first configured machine on hosts whose hostname didn't match one of the built-in patterns.

## 0.7.0

### Minor Changes

- [#150](https://github.com/Medal-Social/Pilot/pull/150) [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect plan 2: pilot CLI side of the pair flow.

  - `pilot connect` — generates ephemeral ECDH keypair, posts to Medal Social,
    prints code, polls until claimed, ECDH-unseals the device token, stores it
    in the OS keychain (via @napi-rs/keyring), opens WS to the per-workspace
    Durable Object, starts 5min heartbeat backstop.
  - `pilot disconnect <deviceId>` — revokes locally + tombstones in Convex +
    drops live socket via Worker /devices/<wsId>/revoke.
  - New medal-connect/ subdir: keychain, ECDH (P-256 + AES-GCM), frames (zod),
    WSClient with reconnect + since-rev resume, HeartbeatLoop (5min app-level).
  - Shell completions (bash/zsh/fish) updated.
  - Adds `@napi-rs/keyring`, `ws`, `@types/ws`, `open` deps.

- [#150](https://github.com/Medal-Social/Pilot/pull/150) [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect Plan 3: kit registers as the first MedalConnectProvider.

  `pilot connect` now pushes a `kit.state` snapshot on first connect and routes
  incoming `kit.rebuild` / `kit.cask.add` / `kit.cask.remove` commands through to
  the existing kit machinery. Provider lifecycle events flow back as
  medalConnectEvents activity feed entries.

- [#150](https://github.com/Medal-Social/Pilot/pull/150) [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect: kit.apply-patch-and-rebuild verb.

  Applies a structured KitPatch (cask add/remove + non-secret raw .nix writes), commits + pushes, runs rebuild. Hard-rejects writes to `secrets/*`, `.git/*`, and `.medal-connect/*` paths (case-insensitive); rejects path traversal, absolute paths, and writes through symlinked ancestors. The CLI's `pilot connect` flow now passes `resolveAppsFile` into the kit provider so cask ops always target the machine-resolved apps file (`machines/<m>.apps.json` post-migration; legacy `apps/apps.json` fallback).

### Patch Changes

- [#150](https://github.com/Medal-Social/Pilot/pull/150) [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46) Thanks [@alioftech](https://github.com/alioftech)! - Add kit `linux` platform (system-manager + home-manager) so `pilot kit init`, `pilot kit update`, and `pilot kit new --type linux` work on non-NixOS systemd Linux distros (Ubuntu, Debian, etc.). The third `type` in `kit.config.json.machines.*` activates `sudo system-manager switch` followed by `home-manager switch` (with a `nix run` fallback on first bootstrap).

- [#150](https://github.com/Medal-Social/Pilot/pull/150) [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46) Thanks [@alioftech](https://github.com/alioftech)! - Two release-quality fixes:
  - The auto-generated Homebrew tap formula now ships with an explicit `version` field and URLs pinned to the release tag, so `brew upgrade pilot` actually upgrades. Previously the formula used `releases/latest` URLs and no version field, making `brew upgrade pilot` a no-op until a human pushed a manual correction on top of each tap PR.
  - `pilot kit init` now exits non-zero when refusing on `gitStrategy=none` (and on any other KitError). Shell scripts wrapping the command can detect the refusal via exit code instead of having to grep stderr.
- Updated dependencies [[`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46), [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46)]:
  - @medalsocial/kit@0.4.0

## 0.6.0

### Minor Changes

- [#143](https://github.com/Medal-Social/Pilot/pull/143) [`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect plan 2: pilot CLI side of the pair flow.

  - `pilot connect` — generates ephemeral ECDH keypair, posts to Medal Social,
    prints code, polls until claimed, ECDH-unseals the device token, stores it
    in the OS keychain (via @napi-rs/keyring), opens WS to the per-workspace
    Durable Object, starts 5min heartbeat backstop.
  - `pilot disconnect <deviceId>` — revokes locally + tombstones in Convex +
    drops live socket via Worker /devices/<wsId>/revoke.
  - New medal-connect/ subdir: keychain, ECDH (P-256 + AES-GCM), frames (zod),
    WSClient with reconnect + since-rev resume, HeartbeatLoop (5min app-level).
  - Shell completions (bash/zsh/fish) updated.
  - Adds `@napi-rs/keyring`, `ws`, `@types/ws`, `open` deps.

- [#143](https://github.com/Medal-Social/Pilot/pull/143) [`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect Plan 3: kit registers as the first MedalConnectProvider.

  `pilot connect` now pushes a `kit.state` snapshot on first connect and routes
  incoming `kit.rebuild` / `kit.cask.add` / `kit.cask.remove` commands through to
  the existing kit machinery. Provider lifecycle events flow back as
  medalConnectEvents activity feed entries.

- [#143](https://github.com/Medal-Social/Pilot/pull/143) [`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect: kit.apply-patch-and-rebuild verb.

  Applies a structured KitPatch (cask add/remove + non-secret raw .nix writes), commits + pushes, runs rebuild. Hard-rejects writes to `secrets/*`, `.git/*`, and `.medal-connect/*` paths (case-insensitive); rejects path traversal, absolute paths, and writes through symlinked ancestors. The CLI's `pilot connect` flow now passes `resolveAppsFile` into the kit provider so cask ops always target the machine-resolved apps file (`machines/<m>.apps.json` post-migration; legacy `apps/apps.json` fallback).

### Patch Changes

- [#143](https://github.com/Medal-Social/Pilot/pull/143) [`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc) Thanks [@alioftech](https://github.com/alioftech)! - Two release-quality fixes:
  - The auto-generated Homebrew tap formula now ships with an explicit `version` field and URLs pinned to the release tag, so `brew upgrade pilot` actually upgrades. Previously the formula used `releases/latest` URLs and no version field, making `brew upgrade pilot` a no-op until a human pushed a manual correction on top of each tap PR.
  - `pilot kit init` now exits non-zero when refusing on `gitStrategy=none` (and on any other KitError). Shell scripts wrapping the command can detect the refusal via exit code instead of having to grep stderr.
- Updated dependencies [[`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc), [`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc)]:
  - @medalsocial/kit@0.3.0

## 0.5.1

### Patch Changes

- [#131](https://github.com/Medal-Social/Pilot/pull/131) [`0581ca5`](https://github.com/Medal-Social/Pilot/commit/0581ca52364805a9c218f15716e1c11cb48c8be1) Thanks [@alioftech](https://github.com/alioftech)! - `pilot update` now detects the installation method (`homebrew` / `npm` / `nix` / `unknown`) and runs the right upgrade command for each. Previously the self-updater always ran `npm install -g @medalsocial/pilot@latest`, which silently failed (or installed to a path off the user's PATH) for Homebrew-installed users. Now Homebrew installs run `brew upgrade pilot`, Nix installs surface a clear `UPDATE_NIX_NOT_SUPPORTED` error pointing at flake/home-manager, and npm/unknown installs keep the existing behaviour.

## 0.5.0

### Minor Changes

- [#127](https://github.com/Medal-Social/Pilot/pull/127) [`07f8c68`](https://github.com/Medal-Social/Pilot/commit/07f8c689b62f6496fde8b586dcc34289197d7e88) Thanks [@alioftech](https://github.com/alioftech)! - Add `gitStrategy` field to `kit.config.json` (`"self" | "none"`, default `"self"`). Set to `"none"` when the kit lives inside a host monorepo or has no git at all — `pilot kit update` skips the git pull, `pilot kit status` drops the git-dependent rows, and `pilot kit init` refuses with `KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY`. Default `"self"` keeps existing kits unchanged. `pilot kit status` also warns when the declared strategy disagrees with the filesystem (e.g. `.git` present under `none`, or kit dir is a subdir of a parent repo under `self`).

### Patch Changes

- Updated dependencies [[`07f8c68`](https://github.com/Medal-Social/Pilot/commit/07f8c689b62f6496fde8b586dcc34289197d7e88)]:
  - @medalsocial/kit@0.2.0

## 0.4.0

### Minor Changes

- [#122](https://github.com/Medal-Social/Pilot/pull/122) [`faaa115`](https://github.com/Medal-Social/Pilot/commit/faaa11570a51516ce306ef5b4f079ddcab994543) Thanks [@alioftech](https://github.com/alioftech)! - Collapse `@medalsocial/pilot-runtime` into `@medalsocial/pilot/runtime` subpath. The host interface, types, and `makeStandaloneHost()` now live at `packages/cli/src/runtime/` and are exposed via the cli package's `./runtime` export. Plugin authors import as:

  ```ts
  import type {
    PilotHost,
    EmailMessage,
    Logger,
  } from "@medalsocial/pilot/runtime";
  import { makeStandaloneHost } from "@medalsocial/pilot/runtime";
  ```

  `@medalsocial/pilot-runtime` is removed from the workspace; it never published to npm so no migration concerns for external consumers. The dispatch plugin's host wiring (`packages/cli/src/plugins/dispatch-host.ts`) now imports types from the local `../runtime/types.js` instead of the cross-package boundary.

## 0.3.0

### Minor Changes

- [#112](https://github.com/Medal-Social/Pilot/pull/112) [`fd791f4`](https://github.com/Medal-Social/Pilot/commit/fd791f412ff93e0068b6b9fdf384e2753136d7ca) Thanks [@alioftech](https://github.com/alioftech)! - Introduce `@medalsocial/pilot-runtime` — typed `PilotHost` interface that every Pilot plugin consumes. Pilot now ships a dispatch loader behind a feature flag (`pilot dispatch <subcommand>`). See dispatch Plan 7 for the plugin side.

### Patch Changes

- Updated dependencies [[`fd791f4`](https://github.com/Medal-Social/Pilot/commit/fd791f412ff93e0068b6b9fdf384e2753136d7ca)]:
  - @medalsocial/pilot-runtime@0.1.0

## 0.2.6

### Patch Changes

- [#113](https://github.com/Medal-Social/Pilot/pull/113) [`1f6221a`](https://github.com/Medal-Social/Pilot/commit/1f6221a97779e44e5c8b6f04caaf0b42fb760416) Thanks [@alioftech](https://github.com/alioftech)! - Pilot Kit readiness: KIT_CONFIG env var honored, completions parity guardrail (bash/zsh/fish), `kit status --json` emits a structured envelope on missing config, plus internal fixes from review (Codex cached double-bill, Codex per-project filtering, ink browse/install render isolation, kit clean dedupes brew vs system caches, changeset auto-classifier fails on ambiguous, JSON grand total nulled when any cost is unknown).

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
