---
'@medalsocial/kit': minor
---

medal-connect: kit.apply-patch-and-rebuild verb.

Applies a structured KitPatch (cask add/remove + non-secret raw .nix writes), commits + pushes, runs rebuild. Hard-rejects writes to `secrets/*` paths per Medal Connect spec §11; rejects path traversal; rejects absolute paths.
