---
"@medalsocial/kit": patch
---

kit: stop hard-mapping the bare `ada` hostname token to `ada-air`

The machine-detection table claimed the bare `ada` token for `ada-air`
(darwin). Once the fleet also had `ada-ws` (linux), any `ada-*` Linux host
resolved to the wrong (darwin) machine, so `pilot kit update` tried a
darwin rebuild on Linux. `ada-air` is already matched by the `air` pattern;
`ada-ws` now resolves via the existing zero-config raw-hostname path (its
hostname is a key in `kit.config.json`).
