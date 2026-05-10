---
'@medalsocial/pilot': minor
'@medalsocial/kit': minor
---

medal-connect Plan 3: kit registers as the first MedalConnectProvider.

`pilot connect` now pushes a `kit.state` snapshot on first connect and routes
incoming `kit.rebuild` / `kit.cask.add` / `kit.cask.remove` commands through to
the existing kit machinery. Provider lifecycle events flow back as
medalConnectEvents activity feed entries.
