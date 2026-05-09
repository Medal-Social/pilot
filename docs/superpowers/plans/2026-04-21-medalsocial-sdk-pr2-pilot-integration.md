# MedalSocial SDK — PR 2: Pilot Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@medalsocial/sdk` usable by Pilot crew agents to call Medal APIs — same pattern as how Vercel SDK is integrated into agent toolchains.

**Architecture:** Add a `plugin.toml` declaring the SDK as a Pilot plugin and a `pilot/index.ts` that exports `createMedalTools(client)` — a factory returning Pilot-compatible (Vercel AI SDK `tool()` shape) tool definitions. The main SDK surface is unchanged; this is additive. A separate Pilot-repo PR (not covered here) wires the SDK into Pilot's crew tool registry.

**Tech Stack:** Zod (new dep), Vercel AI SDK tool shape, Pilot plugin.toml format

**Spec:** `docs/superpowers/specs/2026-04-21-medalsocial-sdk-mainstreaming-design.md`

**Prerequisite:** PR 1 (`2026-04-21-medalsocial-sdk-pr1-release-pipeline.md`) merged to main.

---

## File Map

| Action | Path |
|--------|------|
| Create | `plugin.toml` |
| Create | `pilot/index.ts` |
| Create | `pilot/index.test.ts` |
| Modify | `src/index.ts` (add `createMedalClient` factory) |
| Modify | `package.json` (add `zod` dep, `./pilot` export, `typecheck` script) |

All paths relative to `<sdk-repo-root>/`.

---

## Task 1: Add `createMedalClient` Factory to src/index.ts

The SDK's existing `MedalSocialClient` constructor accepts a full `ClientOptions` object. Pilot needs to instantiate the client from a single API key via env var. This factory is a one-liner convenience wrapper — no logic change to the client.

**Files:**
- Modify: `<sdk-repo-root>/src/index.ts`
- Test: `<sdk-repo-root>/tests/client.test.ts`

- [ ] **Step 1: Write the failing test**

Open `<sdk-repo-root>/tests/client.test.ts` and add:

```typescript
import { describe, it, expect } from 'vitest';
import { createMedalClient, MedalSocialClient } from '../src/index.js';

describe('createMedalClient', () => {
  it('returns a MedalSocialClient instance', () => {
    const client = createMedalClient('test-api-key');
    expect(client).toBeInstanceOf(MedalSocialClient);
  });

  it('uses bearer auth with the provided key', async () => {
    const client = createMedalClient('my-key');
    // Access private field via type assertion for testing
    const auth = (client as unknown as { auth: { kind: string; token: string } }).auth;
    expect(auth.kind).toBe('bearer');
    expect(auth.token).toBe('my-key');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd <sdk-repo-root>
pnpm test -- --run tests/client.test.ts
```

Expected: FAIL — `createMedalClient is not exported`.

- [ ] **Step 3: Add `createMedalClient` to `src/index.ts`**

Append to the end of `<sdk-repo-root>/src/index.ts` (before `export default MedalSocialClient`):

```typescript
/** Convenience factory for Pilot/agent integration — instantiates client from a bearer token. */
export function createMedalClient(apiKey: string, options?: Omit<ClientOptions, 'auth'>): MedalSocialClient {
  return new MedalSocialClient({ ...options, auth: { kind: 'bearer', token: apiKey } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd <sdk-repo-root>
pnpm test -- --run tests/client.test.ts
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
cd <sdk-repo-root>
git add src/index.ts tests/client.test.ts
git commit -m "feat: add createMedalClient factory for agent/Pilot integration"
```

---

## Task 2: Add Zod Dependency and Update package.json Exports

The `pilot/index.ts` uses Zod to define tool parameter schemas (required by Vercel AI SDK's `tool()` shape). Add `zod` as a runtime dependency and wire up the `./pilot` export.

**Files:**
- Modify: `<sdk-repo-root>/package.json`

- [ ] **Step 1: Add `zod` to dependencies, `./pilot` to exports, and update build script**

Update `package.json` — add `"zod": "^3.23.8"` to `dependencies` (create the section if it doesn't exist), add `typecheck` script, update `build` to compile `pilot/index.ts`, and add `./pilot` to `exports`:

```json
{
  "scripts": {
    "build": "tsup src/index.ts pilot/index.ts --dts --format esm,cjs --sourcemap",
    "typecheck": "tsc --noEmit"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./pilot": {
      "types": "./dist/pilot/index.d.ts",
      "import": "./dist/pilot/index.mjs",
      "require": "./dist/pilot/index.js"
    }
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

Merge these changes into the existing `package.json` (don't replace — only add/update the affected keys).

- [ ] **Step 2: Install**

```bash
cd <sdk-repo-root>
pnpm install
```

Expected: lockfile updated, zod installed.

- [ ] **Step 3: Commit**

```bash
cd <sdk-repo-root>
git add package.json pnpm-lock.yaml
git commit -m "chore: add zod dep and ./pilot export entry point"
```

---

## Task 3: Add `plugin.toml`

**Files:**
- Create: `<sdk-repo-root>/plugin.toml`

- [ ] **Step 1: Create `plugin.toml`**

```toml
[plugin]
name = "medalsocial-sdk"
version = "0.1.0"
description = "Medal Social API client for Pilot crew"

[permissions]
network = ["api.medalsocial.com"]

[[tools]]
name = "create_lead"
description = "Create one or more leads in Medal Social CRM"

[[tools]]
name = "create_contact_note"
description = "Attach a note to a contact by ID"

[[tools]]
name = "create_cookie_consent"
description = "Record a user's cookie consent preferences"

[[tools]]
name = "create_event_signup"
description = "Create an event signup with contact and event details"

[[tools]]
name = "create_note"
description = "Create a free-form note for inbound messages"

[[tools]]
name = "send_transactional_email"
description = "Send a transactional email by template slug"
```

- [ ] **Step 2: Commit**

```bash
cd <sdk-repo-root>
git add plugin.toml
git commit -m "feat: add Pilot plugin.toml manifest"
```

---

## Task 4: Implement `pilot/index.ts` — createMedalTools Factory

This file exports a factory that returns tool definitions in Vercel AI SDK's `tool()` shape: `{ description, parameters: ZodSchema, execute }`. Pilot wires these into the crew's tool registry using `tool()` from `ai`.

**Files:**
- Create: `<sdk-repo-root>/pilot/index.ts`
- Test: `<sdk-repo-root>/pilot/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `<sdk-repo-root>/pilot/index.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createMedalTools } from './index.js';
import type { MedalSocialClient } from '../src/index.js';

const mockClient = {
  createLead: vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} }),
  createContactNote: vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} }),
  createCookieConsent: vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} }),
  createEventSignup: vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} }),
  createNote: vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} }),
  sendTransactionalEmail: vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} }),
} as unknown as MedalSocialClient;

describe('createMedalTools', () => {
  it('returns an object with all 6 tools', () => {
    const tools = createMedalTools(mockClient);
    expect(Object.keys(tools)).toHaveLength(6);
    expect(tools).toHaveProperty('createLead');
    expect(tools).toHaveProperty('createContactNote');
    expect(tools).toHaveProperty('createCookieConsent');
    expect(tools).toHaveProperty('createEventSignup');
    expect(tools).toHaveProperty('createNote');
    expect(tools).toHaveProperty('sendTransactionalEmail');
  });

  it('each tool has description, parameters (ZodSchema), and execute', () => {
    const tools = createMedalTools(mockClient);
    for (const [, tool] of Object.entries(tools)) {
      expect(tool).toHaveProperty('description');
      expect(typeof tool.description).toBe('string');
      expect(tool).toHaveProperty('parameters');
      expect(tool.parameters).toBeInstanceOf(z.ZodObject);
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('createLead tool calls client.createLead with parsed args', async () => {
    const tools = createMedalTools(mockClient);
    await tools.createLead.execute({ items: [{ name: 'Alice', email: 'alice@example.com' }] });
    expect(mockClient.createLead).toHaveBeenCalledWith([{ name: 'Alice', email: 'alice@example.com' }]);
  });

  it('sendTransactionalEmail tool calls client.sendTransactionalEmail', async () => {
    const tools = createMedalTools(mockClient);
    await tools.sendTransactionalEmail.execute({ to: 'a@b.com', slug: 'welcome' });
    expect(mockClient.sendTransactionalEmail).toHaveBeenCalledWith({ to: 'a@b.com', slug: 'welcome' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd <sdk-repo-root>
pnpm test -- --run pilot/index.test.ts
```

Expected: FAIL — `./index.js` not found or `createMedalTools` not exported.

- [ ] **Step 3: Implement `pilot/index.ts`**

Create `<sdk-repo-root>/pilot/index.ts`:

```typescript
import { z } from 'zod';
import type { MedalSocialClient } from '../src/index.js';

const LeadItemSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  company: z.string().optional(),
  source: z.string().optional(),
});

const ContactNoteSchema = z.object({
  contactId: z.string(),
  note: z.string(),
});

const CookieConsentSchema = z.object({
  domain: z.string(),
  consentStatus: z.enum(['granted', 'denied', 'partial']),
  consentTimestamp: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  cookiePreferences: z.object({
    necessary: z.object({ allowed: z.boolean() }).optional(),
    analytics: z.object({ allowed: z.boolean() }).optional(),
    marketing: z.object({ allowed: z.boolean() }).optional(),
    functional: z.object({ allowed: z.boolean() }).optional(),
  }),
});

const EventSignupSchema = z.object({
  contact: z.object({
    name: z.string(),
    email: z.string().email(),
    company: z.string().optional(),
  }),
  event: z.object({
    externalId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    time: z.string(),
    location: z.string().optional(),
    thumbnail: z.string().optional(),
  }),
});

const NoteSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  content: z.string().optional(),
});

const TransactionalEmailSchema = z.object({
  to: z.string().email(),
  slug: z.string(),
  additionalData: z.record(z.unknown()).optional(),
});

export function createMedalTools(client: MedalSocialClient) {
  return {
    createLead: {
      description: 'Create one or more leads in Medal Social CRM',
      parameters: z.object({ items: z.array(LeadItemSchema) }),
      execute: async (args: { items: z.infer<typeof LeadItemSchema>[] }) =>
        client.createLead(args.items),
    },
    createContactNote: {
      description: 'Attach a note to a contact by ID',
      parameters: ContactNoteSchema,
      execute: async (args: z.infer<typeof ContactNoteSchema>) =>
        client.createContactNote(args),
    },
    createCookieConsent: {
      description: "Record a user's cookie consent preferences",
      parameters: CookieConsentSchema,
      execute: async (args: z.infer<typeof CookieConsentSchema>) =>
        client.createCookieConsent(args),
    },
    createEventSignup: {
      description: 'Create an event signup with contact and event details',
      parameters: EventSignupSchema,
      execute: async (args: z.infer<typeof EventSignupSchema>) =>
        client.createEventSignup(args),
    },
    createNote: {
      description: 'Create a free-form note for inbound messages',
      parameters: NoteSchema,
      execute: async (args: z.infer<typeof NoteSchema>) =>
        client.createNote(args),
    },
    sendTransactionalEmail: {
      description: 'Send a transactional email by template slug',
      parameters: TransactionalEmailSchema,
      execute: async (args: z.infer<typeof TransactionalEmailSchema>) =>
        client.sendTransactionalEmail(args),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd <sdk-repo-root>
pnpm test -- --run pilot/index.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
cd <sdk-repo-root>
pnpm test -- --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd <sdk-repo-root>
git add pilot/
git commit -m "feat: add createMedalTools factory for Pilot crew integration"
```

---

## Task 5: Final Verification and PR

- [ ] **Step 1: Run quality check**

```bash
cd <sdk-repo-root>
pnpm quality
```

Expected: lint passes, all tests pass.

- [ ] **Step 2: Run typecheck**

```bash
cd <sdk-repo-root>
pnpm typecheck
```

Expected: exits 0, no type errors.

- [ ] **Step 3: Push and open PR**

```bash
cd <sdk-repo-root>
git push origin HEAD
gh pr create \
  --title "feat: add Pilot integration — plugin.toml + createMedalTools factory" \
  --body "Adds Pilot plugin manifest and createMedalTools factory so Pilot crew agents can call Medal APIs. See pilot docs/superpowers/specs/2026-04-21-medalsocial-sdk-mainstreaming-design.md for full spec. Follow-up Pilot-repo PR will wire SDK into crew tool registry."
```

---

## Note: Follow-up Pilot Repo PR

After this SDK PR is published (version bumped and released via changesets), a third PR targeting the **Pilot repo** (`Medal-Social/Pilot`) needs to:

1. Add `@medalsocial/sdk` to `packages/cli/package.json` dependencies
2. Import `createMedalClient` and `createMedalTools` in Pilot's crew tool registry
3. Add `MEDAL_API_KEY` to Pilot's config schema
4. Write an E2E test with `MEDAL_API_KEY` set to a placeholder mock token in an isolated `PILOT_HOME`

That work is out of scope for this plan — it requires a published version of `@medalsocial/sdk` from PR 1+2.
