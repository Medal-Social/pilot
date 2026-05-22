# @medalsocial/kit

## 0.4.0

### Minor Changes

- [#150](https://github.com/Medal-Social/Pilot/pull/150) [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect Plan 3: kit registers as the first MedalConnectProvider.

  `pilot connect` now pushes a `kit.state` snapshot on first connect and routes
  incoming `kit.rebuild` / `kit.cask.add` / `kit.cask.remove` commands through to
  the existing kit machinery. Provider lifecycle events flow back as
  medalConnectEvents activity feed entries.

- [#150](https://github.com/Medal-Social/Pilot/pull/150) [`f7b59cf`](https://github.com/Medal-Social/Pilot/commit/f7b59cf1604f96778325bfbad91ab0840153bc46) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect: kit.apply-patch-and-rebuild verb.

  Applies a structured KitPatch (cask add/remove + non-secret raw .nix writes), commits + pushes, runs rebuild. Hard-rejects writes to `secrets/*`, `.git/*`, and `.medal-connect/*` paths (case-insensitive); rejects path traversal, absolute paths, and writes through symlinked ancestors. The CLI's `pilot connect` flow now passes `resolveAppsFile` into the kit provider so cask ops always target the machine-resolved apps file (`machines/<m>.apps.json` post-migration; legacy `apps/apps.json` fallback).

## 0.3.0

### Minor Changes

- [#143](https://github.com/Medal-Social/Pilot/pull/143) [`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect Plan 3: kit registers as the first MedalConnectProvider.

  `pilot connect` now pushes a `kit.state` snapshot on first connect and routes
  incoming `kit.rebuild` / `kit.cask.add` / `kit.cask.remove` commands through to
  the existing kit machinery. Provider lifecycle events flow back as
  medalConnectEvents activity feed entries.

- [#143](https://github.com/Medal-Social/Pilot/pull/143) [`d67a03c`](https://github.com/Medal-Social/Pilot/commit/d67a03c3891d32ed24a4cb4614c29a0463b292cc) Thanks [@alioftech](https://github.com/alioftech)! - medal-connect: kit.apply-patch-and-rebuild verb.

  Applies a structured KitPatch (cask add/remove + non-secret raw .nix writes), commits + pushes, runs rebuild. Hard-rejects writes to `secrets/*`, `.git/*`, and `.medal-connect/*` paths (case-insensitive); rejects path traversal, absolute paths, and writes through symlinked ancestors. The CLI's `pilot connect` flow now passes `resolveAppsFile` into the kit provider so cask ops always target the machine-resolved apps file (`machines/<m>.apps.json` post-migration; legacy `apps/apps.json` fallback).

## 0.2.0

### Minor Changes

- [#127](https://github.com/Medal-Social/Pilot/pull/127) [`07f8c68`](https://github.com/Medal-Social/Pilot/commit/07f8c689b62f6496fde8b586dcc34289197d7e88) Thanks [@alioftech](https://github.com/alioftech)! - Add `gitStrategy` field to `kit.config.json` (`"self" | "none"`, default `"self"`). Set to `"none"` when the kit lives inside a host monorepo or has no git at all — `pilot kit update` skips the git pull, `pilot kit status` drops the git-dependent rows, and `pilot kit init` refuses with `KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY`. Default `"self"` keeps existing kits unchanged. `pilot kit status` also warns when the declared strategy disagrees with the filesystem (e.g. `.git` present under `none`, or kit dir is a subdir of a parent repo under `self`).

## 0.1.2

### Patch Changes

- [#30](https://github.com/Medal-Social/Pilot/pull/30) [`e360e20`](https://github.com/Medal-Social/Pilot/commit/e360e2059ee2cbc865dd4c400f9fed44635754db) Thanks [@alioftech](https://github.com/alioftech)! - Mark @medalsocial/kit as private to prevent accidental npm publish. Removes publishConfig and updates guardrail test to assert kit is private.

## 0.1.1

### Patch Changes

- [#17](https://github.com/Medal-Social/Pilot/pull/17) [`6ddcd72`](https://github.com/Medal-Social/Pilot/commit/6ddcd72243beadb404384257a70af53809bdd806) Thanks [@alioftech](https://github.com/alioftech)! - Add repository guardrails for AI-assisted changes, security scanning, and release discipline.

  This adds Changesets-based release automation, stricter contributor hooks, tracked-file secret scanning,
  Knip baseline reporting, and tighter published package metadata.
