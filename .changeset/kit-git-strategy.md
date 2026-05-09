---
'@medalsocial/pilot': minor
'@medalsocial/kit': minor
---

Add `gitStrategy` field to `kit.config.json` (`"self" | "none"`, default `"self"`). Set to `"none"` when the kit lives inside a host monorepo or has no git at all — `pilot kit update` skips the git pull, `pilot kit status` drops the git-dependent rows, and `pilot kit init` refuses with `KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY`. Default `"self"` keeps existing kits unchanged. `pilot kit status` also warns when the declared strategy disagrees with the filesystem (e.g. `.git` present under `none`, or kit dir is a subdir of a parent repo under `self`).
