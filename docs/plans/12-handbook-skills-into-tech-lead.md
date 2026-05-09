# Sub-plan 12 — Migrate Medal-Social Handbook Engineering Skills into the `tech-lead` Crew

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Medal-Social handbook's cross-repo engineering skills from "session-injected via the cmux harness" → "bundled into the Pilot CLI under the `tech-lead` crew lead and synced to user `~/.pilot/skills/tech-lead/` via `pilot update`". This makes the skills discoverable through Pilot's normal routing pipeline (the user types a tech request → Pilot dispatches to `tech-lead` → `tech-lead` loads the relevant SKILL.md), portable across hosts (Claude Code / Codex / Gemini per [plan 10](10-skill-runtime.md), Task 57), and protected by the manifest + signing flow (per [plan 09](09-skill-security.md)).

**Architecture:** Each handbook engineering domain (`observability`, `release-and-versioning`, `product-engineering`, etc.) becomes a single SKILL.md under `packages/cli/src/deploy/skills/tech-lead/<name>.md`. The deployer (per [plan 05](05-skill-deployment.md), Task 27) writes them to `~/.pilot/skills/tech-lead/` on `pilot update`. Crew binding lives in `packages/cli/src/registry/bundled.ts` as a new `medal-eng` template entry whose `crew.specialist === 'tech-lead'` and whose `crew.skills` array enumerates the engineering skill ids. Today's session-injected pathway (cmux harness reading the handbook frontmatter) retires once Pilot deploys the same content.

**Tech Stack:** TypeScript (strict), Zod (schema), Vitest (TDD), Changesets (release), the existing skill-deployment + skill-security modules from plans 05 and 09. No new dependencies.

**Depends on:**
- [05-skill-deployment.md](05-skill-deployment.md) — Tasks 26-28 (skill directory layout + deployer + symlink + CLAUDE.md routing)
- [09-skill-security.md](09-skill-security.md) — Tasks 48-52 (schema validation, signing, script safety, sync, version tracking)
- [10-skill-runtime.md](10-skill-runtime.md) — Tasks 53-57 (preamble, learnings, checkpoints, multi-host)
- The Medal-Social handbook at `https://github.com/alioftech/hacks/tree/main/medal-social-best-practices` — the source content for each skill

**Source content (cross-repo):**
- `medal-social-best-practices/observability/README.md`
- `medal-social-best-practices/release-and-versioning/README.md`
- `medal-social-best-practices/product-engineering/README.md`
- `medal-social-best-practices/infra/README.md`
- `medal-social-best-practices/security/README.md`
- `medal-social-best-practices/frontend/README.md`
- `medal-social-best-practices/testing/README.md`
- `medal-social-best-practices/dev-tooling/README.md`
- `medal-social-best-practices/bots/README.md`
- `medal-social-best-practices/github/README.md`
- `medal-social-best-practices/skills/README.md` (the meta-skill — how to author + maintain skills under each crew lead)

Each source README has `name:` + `description:` frontmatter already (the cmux harness reads them as Skills today). The conversion is mostly truncation + reshape per `superpowers:writing-skills` rules; per-domain sub-files under each handbook directory become referenced files alongside the SKILL.md.

---

## Task 62: Convert each handbook README into a SKILL.md draft

**Files:**
- Create: `packages/cli/src/deploy/skills/tech-lead/observability.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/release-and-versioning.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/product-engineering.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/infra.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/security.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/frontend.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/testing.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/dev-tooling.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/bots.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/github.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/skills.md`
- Create: `packages/cli/src/deploy/skills/tech-lead/pilot-cli-dev.md` (renamed from `pilot-dev` — see Self-Review)

Per-skill steps (repeat for each file above):

- [ ] **Step 1: Pull the source README from the handbook**

```bash
curl -sSL "https://raw.githubusercontent.com/alioftech/hacks/main/medal-social-best-practices/<domain>/README.md" \
  > packages/cli/src/deploy/skills/tech-lead/<name>.md
```

- [ ] **Step 2: Reshape the frontmatter to skill-conformant form**

The handbook frontmatter looks like:
```yaml
---
name: best-practices-<domain>
description: <descriptive paragraph>
---
```

Rewrite to:
```yaml
---
name: <domain>            # bare, kebab-case, no `best-practices-` prefix
description: Use when <triggering conditions and symptoms — never workflow summary>
---
```

The description MUST follow the `superpowers:writing-skills` rule: starts with "Use when…" and lists triggering conditions only.

- [ ] **Step 3: Trim the body**

Skills SHOULD be ≤ 300 lines (per `medal-social-best-practices/skills/README.md`). Move heavy reference content into sibling files under `packages/cli/src/deploy/skills/tech-lead/<name>/<sub>.md` and link from the SKILL.md. The handbook source is mostly already at this shape; minor trimming of cross-handbook links is the only common change.

- [ ] **Step 4: Add a `# Last verified:` footer**

Bump to today's date.

- [ ] **Step 5: Validate with the Pilot schema**

```bash
pnpm test packages/cli/src/skills/schema.test.ts
pnpm test packages/cli/src/skills/validator.test.ts
```

Per [plan 09, Task 48](09-skill-security.md). Both must pass against each new SKILL.md.

- [ ] **Step 6: Commit per skill**

```bash
git add packages/cli/src/deploy/skills/tech-lead/<name>.md
git commit -m "feat(skills): add tech-lead/<name> SKILL.md from handbook"
```

One commit per skill — keeps the diff reviewable + lets us bisect if a single skill's content breaks routing.

---

## Task 63: Decide bundled vs registry-fetched per skill

**Files:**
- Modify: `packages/cli/src/registry/bundled.ts` (per-skill `SkillStep` URL or local-bundle marker)

The bundled-vs-fetched decision lives in `bundled.ts` per the existing registry shape (see `pencil` for fetched, the planned `pilot/SKILL.md` for purely-bundled).

- [ ] **Step 1: Apply the decision matrix**

| Skill | Decision | Why |
|---|---|---|
| `observability` | bundled | Stable; needed offline during outages |
| `release-and-versioning` | bundled | Security-sensitive; must work offline |
| `product-engineering` | bundled | Stable cross-repo policy |
| `infra` | bundled | Stable; outage-relevant |
| `security` | bundled | Security-sensitive; must work offline |
| `frontend` | registry-fetched | Moves with framework releases (Next.js, base-ui, etc.) |
| `testing` | bundled | Stable discipline content |
| `dev-tooling` | bundled | Stable; defines `.claude/` shape |
| `bots` | registry-fetched | Moves with bot-config tweaks |
| `github` | bundled | Stable PR/CI policy |
| `skills` | bundled | Stable meta-policy |
| `pilot-cli-dev` | bundled | Ships with the Pilot binary it documents |

- [ ] **Step 2: For registry-fetched skills, host the file**

Push each registry-fetched SKILL.md to `pilot.medalsocial.com/registry/v1/skills/<name>.md` (the same hosting used by `pencil` and `remotion`). Verify the SHA-256 returned by the server matches what `bundled.ts` expects.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/registry/bundled.ts
git commit -m "feat(registry): set bundled-vs-fetched per tech-lead skill"
```

---

## Task 64: Wire `tech-lead` into `bundled.ts`

**Files:**
- Modify: `packages/cli/src/registry/bundled.ts`
- Modify: `packages/cli/src/registry/bundled.test.ts`

Today `bundled.ts` only ships `design-specialist` and `video-specialist` crew bindings (against the `pencil` and `remotion` templates). Neither matches the planned 5-leads model. This task adds the `tech-lead` binding in a way that's compatible with the per-lead skill arrays the deployer expects (per [plan 05, Task 26](05-skill-deployment.md)).

- [ ] **Step 1: Write the test first**

Add to `packages/cli/src/registry/bundled.test.ts`:

```ts
it('exposes the tech-lead crew binding with the engineering skill set', () => {
  const techLead = BUNDLED_REGISTRY.templates.find(
    (t) => t.crew?.specialist === 'tech-lead',
  );
  expect(techLead).toBeDefined();
  expect(techLead?.crew?.skills).toEqual(
    expect.arrayContaining([
      'observability',
      'release-and-versioning',
      'product-engineering',
      'infra',
      'security',
      'frontend',
      'testing',
      'dev-tooling',
      'bots',
      'github',
      'skills',
      'pilot-cli-dev',
    ]),
  );
});
```

Run; expect FAIL.

- [ ] **Step 2: Add the `medal-eng` template entry to `bundled.ts`**

```ts
{
  name: 'medal-eng',
  displayName: 'Medal-Social engineering bundle',
  description: 'Cross-repo engineering policies — observability, releases, security, infra',
  version: '0.1.0',
  category: 'eng',
  platforms: ['darwin', 'linux', 'win32'],
  steps: [
    // bundled skills are written by the deployer (Task 27) — no SkillStep needed for them
    // registry-fetched skills get a SkillStep entry per name:
    {
      type: 'skill',
      id: 'frontend',
      url: 'https://pilot.medalsocial.com/registry/v1/skills/frontend.md',
      label: 'Frontend skill',
    },
    {
      type: 'skill',
      id: 'bots',
      url: 'https://pilot.medalsocial.com/registry/v1/skills/bots.md',
      label: 'Bots skill',
    },
  ],
  crew: {
    specialist: 'tech-lead',
    displayName: 'Tech Lead',
    skills: [
      'observability',
      'release-and-versioning',
      'product-engineering',
      'infra',
      'security',
      'frontend',
      'testing',
      'dev-tooling',
      'bots',
      'github',
      'skills',
      'pilot-cli-dev',
    ],
  },
  completionHint: 'Talk to your Tech Lead — try "scaffold a NextMedal app" or "cut a release".',
},
```

Run the test; expect PASS.

- [ ] **Step 3: Verify schema still validates**

```bash
pnpm test packages/cli/src/registry/bundled.test.ts packages/cli/src/registry/types.test.ts
```

Per [`packages/cli/src/registry/types.ts`](../../packages/cli/src/registry/types.ts), `CrewEntrySchema` already accepts an arbitrary string for `specialist` — no schema change needed for the new lead.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/registry/bundled.ts packages/cli/src/registry/bundled.test.ts
git commit -m "feat(registry): add tech-lead crew binding with engineering skill set"
```

---

## Task 65: Wire crew-lead routing if not already in place

**Files:**
- Modify: `packages/cli/src/deploy/skills/pilot/SKILL.md` (the router) — verify the dispatch list mentions tech-lead
- Modify: `packages/cli/src/deploy/skills/tech-lead/SKILL.md` (the lead's main skill from [plan 05, Task 26](05-skill-deployment.md)) — verify it pulls in the new domain skills

Per [plan 05, Task 26 Step 1](05-skill-deployment.md), the `pilot/SKILL.md` router already dispatches to `tech-lead` for "Build, deploy, scaffold, code review, Pilot development". The work in this task is verifying nothing regressed:

- [ ] **Step 1: Read the deployed `pilot/SKILL.md` router**

Confirm the routing rules section enumerates the trigger phrases for each lead. If `tech-lead` is missing observability / release / etc. trigger phrases, add them.

- [ ] **Step 2: Read the deployed `tech-lead/SKILL.md`**

Confirm it explicitly references the new SKILL.md files under `~/.pilot/skills/tech-lead/`. Add a "Pull in" section listing the domain skills:

```markdown
## When invoked, pull in the right domain skill

| User intent | Pull in |
|---|---|
| Adding logs / tracking errors / debugging an outage | observability |
| Cutting a release / dev→prod / changeset | release-and-versioning |
| Cross-repo product code (TS/test/commit/review discipline) | product-engineering |
| Infra / hosting / Vercel project setup | infra |
| Anything security-sensitive (secrets, deps, signing) | security |
| Frontend / Next.js / UI primitives | frontend |
| Test discipline, vitest, ink-testing-library | testing |
| `.claude/` setup / Claude Code harness | dev-tooling |
| GitHub Actions / PR review / branch protection | github |
| Authoring or auditing a skill | skills |
| Pilot CLI monorepo development | pilot-cli-dev |
```

- [ ] **Step 3: Run end-to-end deployer test**

```bash
pnpm test packages/cli/src/deploy/structure.test.ts packages/cli/src/deploy/deployer.test.ts
```

Per [plan 05, Tasks 26-27](05-skill-deployment.md). Both must pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/deploy/skills/
git commit -m "feat(deploy): wire tech-lead routing for handbook engineering skills"
```

---

## Task 66: Test in Pilot CLI

**Files:**
- (none new — this is a manual verification gate)

- [ ] **Step 1: Build a fresh Pilot binary**

```bash
pnpm build
```

- [ ] **Step 2: Deploy to a clean pilot home**

```bash
PILOT_HOME=/tmp/pilot-tech-lead-test ./packages/cli/dist/bin/pilot.js update
```

- [ ] **Step 3: Verify the layout**

```bash
ls -la /tmp/pilot-tech-lead-test/skills/tech-lead/
# expect: SKILL.md plus one file per skill (observability.md, release-and-versioning.md, …)
cat /tmp/pilot-tech-lead-test/manifest.json | jq '.skills | keys'
# expect: includes "tech-lead"
```

- [ ] **Step 4: Invoke the skill via Claude Code**

In a session that has `~/.claude/skills/pilot` symlinked (the deployer creates this), type a tech-flavoured prompt (e.g. "Walk me through cutting a Pilot release"). Verify Claude:

1. Invokes the `pilot` skill (the router)
2. Dispatches to `tech-lead`
3. `tech-lead` pulls in `release-and-versioning` and uses its content

If routing fails, the most likely cause is the `## Pilot routing` block in `~/.claude/CLAUDE.md` not enumerating release-flavoured trigger phrases (see [plan 05, Task 27 `generateRoutingSection()`](05-skill-deployment.md)).

- [ ] **Step 5: Verify multi-host (optional, per [plan 10, Task 57](10-skill-runtime.md))**

If Codex is installed (`~/.codex/`), confirm `pilot update` also symlinks the deployed skills there:

```bash
ls -la ~/.codex/skills/pilot/
```

- [ ] **Step 6: Capture findings, no commit**

This is a verification gate — record results in the PR description.

---

## Task 67: Cut a Pilot release

**Files:**
- Create: `.changeset/tech-lead-handbook-skills.md`

- [ ] **Step 1: Add a Changeset**

```bash
pnpm changeset
```

Pick MINOR (per [`medal-social-best-practices/skills/maintenance-and-currency.md`](https://github.com/alioftech/hacks/blob/main/medal-social-best-practices/skills/maintenance-and-currency.md) versioning rules — adding a new skill to a crew lead's `skills:` array is MINOR).

Body:
```
Add the tech-lead crew binding with the Medal-Social engineering skills
(observability, release-and-versioning, product-engineering, infra,
security, frontend, testing, dev-tooling, bots, github, skills,
pilot-cli-dev). Migrates content previously session-injected by the
cmux harness into the canonical Pilot pipeline. Existing crew bindings
(design-specialist, video-specialist) unchanged.
```

- [ ] **Step 2: Open PR against `dev`**

Pilot's release flow merges `dev` → `main`; CI cuts a Changeset version PR; merging that publishes the new Pilot version.

- [ ] **Step 3: Once published, retire the cmux session-injection path**

Out-of-tree: open a follow-up issue in cmux to stop reading the handbook frontmatter as Skills (Pilot now ships them through the proper pipeline).

- [ ] **Step 4: Update the handbook catalogue**

In `medal-social-best-practices/skills/medal-skills-catalog.md`, change each migrated skill's "Migration status" column from "Planned" to "Shipped in Pilot vX.Y.Z".

---

## Self-Review

| Spec item | Task |
|---|---|
| Convert handbook MD → SKILL.md format | Task 62 |
| Decide bundled vs registry-fetched per skill | Task 63 |
| Add `tech-lead` binding to `bundled.ts` | Task 64 |
| Wire crew-lead routing | Task 65 |
| End-to-end test via Pilot CLI | Task 66 |
| Cut a Pilot release | Task 67 |

### Open decisions

- **Rename `pilot-dev` → `pilot-cli-dev`?** This plan assumes yes. Rationale: the top-level `pilot` skill is now the umbrella router (per [plan 05, Task 26](05-skill-deployment.md)); `pilot-dev` reading naturally as "developing pilot" collides. `pilot-cli-dev` is unambiguous. Decision needed before Task 62 commits — easier to land the renamed file once than to rename it later.
- **`medal-eng` template name.** This plan packs the `tech-lead` binding into a single `medal-eng` template entry in `bundled.ts`. Alternative: split into one template per skill (12 entries). Single template is lighter for the registry index but means `pilot up medal-eng` installs all skills as a bundle (currently the only way `pilot up` installs anything — see [plan 04](04-pilot-up-kit.md)). Decision needed: does the user care about installing skills à la carte? Recommendation: ship as a single bundle for v0.1; split later if telemetry shows users want piecemeal control.
- **Hosting registry-fetched skills.** This plan assumes `pilot.medalsocial.com/registry/v1/skills/` is operational (it already serves `pencil.md` and `remotion.md`). Confirm the publish path before Task 63 Step 2 — if hosting is a blocker, default everything to bundled (Pattern A) and revisit later.
- **Source-of-truth for the SKILL.md files.** The handbook lives at `alioftech/hacks` and is the canonical source. Once these skills land in Pilot, edits MUST happen in Pilot first (because Pilot is what users `update` from); the handbook then re-syncs. Alternative: keep the handbook canonical and have a sync script in Pilot. Recommendation: Pilot canonical (one source of truth, fewer drift hazards).

### Tension with existing plans

- **[Plan 05, Task 26](05-skill-deployment.md)** lists `tech-lead` as one of 5 leads but only stubs out the SKILL.md with generic "Tech Lead" content. This plan replaces that stub with the routing-to-domain-skills version (Task 65 Step 2). No conflict, just a refinement.
- **[Plan 09, Task 48-49](09-skill-security.md)** validates SKILL.md frontmatter with Zod and SHA-256-signs every deployed file. This plan's skills MUST pass that validation (Task 62 Step 5) and benefit from tamper detection (Task 66 Step 3). No conflict; this plan exercises the existing pipeline.
- **[Plan 10, Task 57](10-skill-runtime.md)** symlinks deployed skills into `~/.codex/skills/` and `~/.gemini/skills/` if those hosts are detected. This plan's skills inherit that for free. Verify in Task 66 Step 5.
- **[Plan 10, Task 53](10-skill-runtime.md)** embeds a bash preamble in each SKILL.md. This plan's skills DON'T need their own preambles — they're loaded *by* `tech-lead`, which inherits the preamble from `pilot/SKILL.md`. Confirm in Task 66 Step 4 that the preamble isn't double-firing.

### Cross-references

- Source content: [`medal-social-best-practices/skills/distribution-and-discovery.md`](https://github.com/alioftech/hacks/blob/main/medal-social-best-practices/skills/distribution-and-discovery.md) (the handbook's docs that motivated this plan)
- Source content: [`medal-social-best-practices/skills/medal-skills-catalog.md`](https://github.com/alioftech/hacks/blob/main/medal-social-best-practices/skills/medal-skills-catalog.md) (the per-skill intended-binding table)
- Pilot v2 design: [`docs/specs/2026-04-09-pilot-cli-v2-design.md`](../specs/2026-04-09-pilot-cli-v2-design.md) — Tech Lead section (lines ~115-160 + ~320-340)
- Pilot plans: [05](05-skill-deployment.md), [09](09-skill-security.md), [10](10-skill-runtime.md)

### Out of scope

- Migrating brand / marketing / cs / sales content. The handbook only covers engineering today; the other 4 leads remain unbound. Track those as separate plans when their content exists.
- Rewriting the `pilot/SKILL.md` router. [Plan 05, Task 26](05-skill-deployment.md) defines its current shape; this plan inherits.
- Auto-generating the handbook catalogue from `bundled.ts`. Tracked as an open question in `medal-skills-catalog.md`; address once skill count > 20 per lead.
