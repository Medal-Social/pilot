---
'@medalsocial/pilot': minor
---

Collapse `@medalsocial/pilot-runtime` into `@medalsocial/pilot/runtime` subpath. The host interface, types, and `makeStandaloneHost()` now live at `packages/cli/src/runtime/` and are exposed via the cli package's `./runtime` export. Plugin authors import as:

```ts
import type { PilotHost, EmailMessage, Logger } from '@medalsocial/pilot/runtime';
import { makeStandaloneHost } from '@medalsocial/pilot/runtime';
```

`@medalsocial/pilot-runtime` is removed from the workspace; it never published to npm so no migration concerns for external consumers. The dispatch plugin's host wiring (`packages/cli/src/plugins/dispatch-host.ts`) now imports types from the local `../runtime/types.js` instead of the cross-package boundary.
