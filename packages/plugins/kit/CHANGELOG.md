# @medalsocial/kit

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
