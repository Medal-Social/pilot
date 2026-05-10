---
'@medalsocial/pilot': minor
'@medalsocial/kit': minor
---

medal-connect: kit.apply-patch-and-rebuild verb.

Applies a structured KitPatch (cask add/remove + non-secret raw .nix writes), commits + pushes, runs rebuild. Hard-rejects writes to `secrets/*`, `.git/*`, and `.medal-connect/*` paths (case-insensitive); rejects path traversal, absolute paths, and writes through symlinked ancestors. The CLI's `pilot connect` flow now passes `resolveAppsFile` into the kit provider so cask ops always target the machine-resolved apps file (`machines/<m>.apps.json` post-migration; legacy `apps/apps.json` fallback).
