# MedalSocial SDK Mainstreaming Design

**Date:** 2026-04-21
**Status:** Approved
**Repos:** Medal-Social/MedalSocial (SDK), Medal-Social/Pilot (integration)

## Overview

Bring `@medalsocial/sdk` up to Pilot's release quality and wire it into Pilot as a first-class crew capability. Delivered as two PRs: one for release pipeline parity, one for Pilot integration.

---

## PR 1 — Release Pipeline & Workflow Parity

### Goals
- Replace ad-hoc git-tag releases with Changesets (automated changelog, PR-based version bumps)
- Publish to both npm and JSR for full runtime coverage (Node, Bun, Deno, edge, browsers)
- Adopt Pilot's full workflow automation suite
- Add Knip and Secretlint

### Changeset Migration

Remove `publish.yml` (git-tag trigger). Add:

- `.changeset/config.json`
  ```json
  {
    "$schema": "https://unpkg.com/@changesets/config/schema.json",
    "changelog": ["@changesets/changelog-github", { "repo": "Medal-Social/MedalSocial" }],
    "commit": false,
    "baseBranch": "main",
    "access": "public",
    "updateInternalDependencies": "patch"
  }
  ```
- `@changesets/cli` and `@changesets/changelog-github` added to dev dependencies
- `package.json` scripts:
  ```json
  "version": "changeset version",
  "release": "pnpm build && changeset publish"
  ```

### Release Workflow (`release.yml`)

Replaces `publish.yml`. Triggers on push to `main` or `workflow_dispatch`.

Key changes from current `publish.yml`:
- Uses GitHub App token (`RELEASE_APP_ID` + `RELEASE_APP_PRIVATE_KEY`) instead of bare `NPM_TOKEN`
- Node 24, pnpm 10.30.3
- Runs `pnpm quality` gate before publish
- Uses `changesets/action` — creates "Version Packages" PR or publishes on merge
- `NPM_CONFIG_PROVENANCE: 'true'` (keep existing)
- Adds JSR publish step after npm: `npx jsr publish`

### JSR Distribution

Add `jsr.json` at repo root:
```json
{
  "name": "@medalsocial/sdk",
  "version": "0.1.0",
  "exports": "./src/index.ts"
}
```

JSR uses TypeScript source directly — no separate build step, always accurate types. Covers Deno and edge runtimes not reached by npm.

npm covers: Node, Bun, all bundlers (Next.js, Vite, webpack, etc.)
JSR covers: Deno, edge runtimes, plus redundant coverage for Node/Bun

### Tooling Additions

**Knip** (`knip.json` + `"knip"` script):
- Dead export and unused dependency analysis
- Critical for a public SDK — prevents shipping unused exports or ghost dependencies

**Secretlint** (`.secretlintrc.json`):
- Scans staged files for credentials before commit
- Matches Pilot's setup; important for a public repo

**Node / pnpm versions:**
- Node: `>=22` → `>=24.0.0 <25` (align with Pilot)
- pnpm: `10.16.0` → `10.30.3`

**Kept as-is:** tsup, TypeDoc, `docs.yml` (GitHub Pages), commitlint, Biome, Husky, vitest

### Workflow Suite (adapted from Pilot)

Brought over (SDK-compatible):

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Build, lint, test — update to Node 24, add `pnpm quality` |
| `release.yml` | Changeset-based release (replaces `publish.yml`) |
| `docs.yml` | TypeDoc → GitHub Pages (keep, no changes) |
| `codeql.yml` | Security scanning |
| `scorecard.yml` | OSSF supply chain security score |
| `auto-approve.yml` | Auto-approve release bot PRs |
| `auto-triage-issues.yml` | Label and route new issues |
| `breaking-change-checker.yml` | Flag breaking API changes on PRs |
| `pr-triage-agent.yml` | Label and assign PRs |
| `test-quality-sentinel.yml` | Enforce coverage thresholds |
| `daily-workflow-updater.yml` | Keep workflow actions pinned to latest |

Excluded (CLI/binary-specific): `build-binaries.yml`, `deploy-worker.yml`, `agentics-maintenance.yml`

---

## PR 2 — Pilot Integration

### Goals
- Make `@medalsocial/sdk` usable by Pilot crew agents to call Medal APIs
- Pattern matches how Vercel AI SDK is integrated into agent toolchains
- SDK stays its own independent package; Pilot consumes it as a dependency

### In the SDK repo

**`plugin.toml`** (root):
```toml
[plugin]
name = "medalsocial-sdk"
version = "0.1.0"
description = "Medal Social API client for Pilot crew"

[permissions]
network = ["api.medal.tv"]

[[tools]]
name = "medal_api"
description = "Call Medal Social API endpoints"
```

**`pilot/` directory** (new, inside SDK repo):
- `index.ts` — exports a `createMedalTools(client)` factory that returns Pilot-compatible tool definitions (Zod-validated, matching Pilot's error code pattern with `PilotError`/`errorCodes`)
- Thin wrapper only — no SDK logic lives here, just the Pilot interface layer

**`createMedalClient` export** (in main `src/index.ts`):
- Accepts `{ apiKey: string }` — Pilot passes this from its env/config system (`MEDAL_API_KEY`)
- No change to existing SDK surface; additive only

### In the Pilot repo (separate Pilot-repo PR, merged after SDK PR 2 is published)

- Add `@medalsocial/sdk` to `packages/cli/package.json` dependencies
- Register `createMedalTools` in the crew tool registry
- Add `MEDAL_API_KEY` to Pilot's config schema (`.pilot/config` or env)
- Tech crew lead gets Medal API access automatically on install

### Testing

- SDK unit tests remain in the SDK repo (no change)
- Pilot integration: E2E test with `MEDAL_API_KEY=test_mock` in isolated `PILOT_HOME`
- `createMedalTools` has its own unit tests in `pilot/index.test.ts`

---

## Distribution Summary

| Channel | Runtime coverage | When |
|---------|-----------------|------|
| npm (`@medalsocial/sdk`) | Node, Bun, bundlers (Next.js, Vite, etc.) | PR 1 |
| JSR (`@medalsocial/sdk`) | Deno, edge runtimes | PR 1 |
| Pilot crew | Pilot agent toolchain | PR 2 |
| Homebrew | N/A — SDK is a library, not a binary | Future: if a `medal` CLI is added |

## Out of Scope

- Monorepo split (single package is correct for a universal SDK)
- `medal` CLI binary / Homebrew tap (future PR 3 if needed)
- Any changes to SDK's existing tsup build or TypeDoc setup
