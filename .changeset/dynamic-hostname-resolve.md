---
'@medalsocial/pilot': patch
---

`pilot kit ...` commands now also resolve the machine when the host's `hostname` is itself a key in `kit.config.json → machines` (in addition to the existing `detectMachine` pattern map). Lets any user register `machines.<their-hostname>` and have it route correctly without needing to add a pattern to `detect.ts` — surfaced on a fresh Linux VM whose hostname (`ali-ubuntu`) had no pattern match and silently fell back to the first configured machine.
