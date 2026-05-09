---
'@medalsocial/pilot': patch
---

Two release-quality fixes:
- The auto-generated Homebrew tap formula now ships with an explicit `version` field and URLs pinned to the release tag, so `brew upgrade pilot` actually upgrades. Previously the formula used `releases/latest` URLs and no version field, making `brew upgrade pilot` a no-op until a human pushed a manual correction on top of each tap PR.
- `pilot kit init` now exits non-zero when refusing on `gitStrategy=none` (and on any other KitError). Shell scripts wrapping the command can detect the refusal via exit code instead of having to grep stderr.
