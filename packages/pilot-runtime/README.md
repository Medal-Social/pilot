# @medalsocial/pilot-runtime

Host interface that Pilot plugins consume. Provides typed contracts for:

- `cloud.send(event)` — push a sync event up to Pilot's cloud uploader
- `email.send(msg)` — send transactional email through Pilot's Medal SDK transport
- `secrets.get(name)` — read a Pilot-managed secret (e.g. workspace API key)
- `auth.medalSocial()` — read the current Medal Social workspace context (or null)
- `log` — structured logger that aggregates per-workspace

Plugins import this package, are constructed with a `PilotHost`, and get a working
no-op `makeStandaloneHost()` for development without Pilot attached.

License: Apache-2.0
