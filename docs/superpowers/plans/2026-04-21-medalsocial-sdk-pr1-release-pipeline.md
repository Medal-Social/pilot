# MedalSocial SDK — PR 1: Release Pipeline & Workflow Parity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `@medalsocial/sdk` to Pilot's release quality — changesets, JSR dual-publishing, full GitHub Actions workflow suite, Knip, and Secretlint.

**Architecture:** Single-package SDK in `<sdk-repo-root>/`. No monorepo restructure. Replace ad-hoc git-tag publish with changesets PR flow. Add security + quality automation matching Pilot.

**Tech Stack:** Changesets, JSR, Knip, Secretlint, GitHub Actions (gh-aw lock workflows), pnpm 10.30.3, Node 24

**Spec:** `docs/superpowers/specs/2026-04-21-medalsocial-sdk-mainstreaming-design.md`

---

> **Prerequisites — GitHub secrets needed in Medal-Social/MedalSocial repo before release workflow fires:**
> - `RELEASE_APP_ID` + `RELEASE_APP_PRIVATE_KEY` (same GitHub App as Pilot — `medal-social-release-bot`)
> - `CODECOV_TOKEN` (for coverage uploads in CI)
> These must be set in repo Settings → Secrets before merging.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `package.json` |
| Create | `.changeset/config.json` |
| Create | `jsr.json` |
| Create | `.secretlintrc.json` |
| Create | `scripts/secretlint-staged.mjs` |
| Create | `scripts/secretlint-repo.mjs` |
| Modify | `.github/workflows/ci.yml` |
| Create | `.github/workflows/release.yml` |
| Delete | `.github/workflows/publish.yml` |
| Create | `.github/workflows/codeql.yml` |
| Create | `.github/workflows/scorecard.yml` |
| Create | `.github/workflows/auto-approve.yml` |
| Copy   | `.github/workflows/auto-triage-issues.lock.yml` (from Pilot) |
| Copy   | `.github/workflows/breaking-change-checker.lock.yml` (from Pilot) |
| Copy   | `.github/workflows/daily-workflow-updater.lock.yml` (from Pilot) |
| Copy   | `.github/workflows/pr-triage-agent.lock.yml` (from Pilot) |
| Copy   | `.github/workflows/test-quality-sentinel.lock.yml` (from Pilot) |

All paths are relative to `<sdk-repo-root>/`.

---

## Task 1: Update package.json

**Files:**
- Modify: `<sdk-repo-root>/package.json`

- [ ] **Step 1: Update engines, packageManager, and add scripts**

Replace the relevant sections so `package.json` becomes:

```json
{
  "name": "@medalsocial/sdk",
  "version": "0.1.0",
  "description": "TypeScript client for Medal Social API (create leads, notes, cookie consents, event signups)",
  "license": "MIT",
  "author": "Medal Social / Ali Aljumaili",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Medal-Social/MedalSocial.git"
  },
  "bugs": {
    "url": "https://github.com/Medal-Social/MedalSocial/issues"
  },
  "homepage": "https://github.com/Medal-Social/MedalSocial#readme",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "sideEffects": false,
  "engines": {
    "node": ">=24.0.0 <25"
  },
  "packageManager": "pnpm@10.30.3",
  "scripts": {
    "preinstall": "npx only-allow pnpm",
    "build": "tsup src/index.ts --dts --format esm,cjs --sourcemap",
    "dev": "tsup src/index.ts --watch",
    "clean": "rm -rf dist",
    "prepare": "husky",
    "test": "vitest run",
    "test:watch": "vitest",
    "docs": "typedoc",
    "lint": "biome check .",
    "lint:fix": "biome check --fix .",
    "quality": "pnpm lint && pnpm test",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && changeset publish && npx jsr publish",
    "secret:scan": "node scripts/secretlint-repo.mjs",
    "secret:scan:staged": "node scripts/secretlint-staged.mjs",
    "knip:report": "knip --reporter json --no-exit-code",
    "knip:check": "knip"
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx,json,jsonc,md,yml,yaml}": [
      "biome check --write --no-errors-on-unmatched"
    ]
  },
  "publishConfig": {
    "access": "public"
  },
  "files": ["dist"],
  "keywords": ["medal", "social", "sdk", "api", "typescript", "client"],
  "devDependencies": {
    "@changesets/changelog-github": "^0.5.1",
    "@changesets/cli": "^2.29.7",
    "@secretlint/secretlint-rule-preset-recommend": "^9.3.2",
    "@types/node": "^24.3.2",
    "@vitest/coverage-v8": "^2.0.5",
    "@biomejs/biome": "^1.8.3",
    "@commitlint/cli": "^19.4.0",
    "@commitlint/config-conventional": "^19.4.0",
    "husky": "^9.1.6",
    "knip": "^5.63.1",
    "lint-staged": "^16.2.6",
    "only-allow": "^1.2.1",
    "secretlint": "^9.3.2",
    "tsup": "^8.3.0",
    "typedoc": "^0.26.6",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd <sdk-repo-root>
pnpm install
```

Expected: lockfile updated, no errors.

- [ ] **Step 3: Verify quality script runs**

```bash
cd <sdk-repo-root>
pnpm quality
```

Expected: lint passes, tests pass.

- [ ] **Step 4: Commit**

```bash
cd <sdk-repo-root>
git add package.json pnpm-lock.yaml
git commit -m "chore: update engines, packageManager, scripts, and add changeset/knip/secretlint deps"
```

---

## Task 2: Initialize Changesets

**Files:**
- Create: `<sdk-repo-root>/.changeset/config.json`
- Create: `<sdk-repo-root>/.changeset/README.md`

- [ ] **Step 1: Create `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    {
      "repo": "Medal-Social/MedalSocial"
    }
  ],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 2: Create `.changeset/README.md`**

```markdown
# Changesets

Hello and welcome! This folder has been created to manage versioning and changelog entries.

We use [changesets](https://github.com/changesets/changesets) to manage versions, create changelogs, and publish to npm.

## Workflow

1. Make your changes in a PR
2. Run `pnpm changeset` to describe your change
3. Commit the generated `.md` file with your PR
4. When merged to `main`, the release bot creates a "Version Packages" PR
5. Merging that PR publishes to npm and JSR automatically
```

- [ ] **Step 3: Verify changeset CLI works**

```bash
cd <sdk-repo-root>
pnpm changeset --help
```

Expected: shows changeset CLI help text.

- [ ] **Step 4: Commit**

```bash
cd <sdk-repo-root>
git add .changeset/
git commit -m "chore: initialize changesets"
```

---

## Task 3: Add JSR Config

**Files:**
- Create: `<sdk-repo-root>/jsr.json`

- [ ] **Step 1: Create `jsr.json`**

```json
{
  "name": "@medalsocial/sdk",
  "exports": "./src/index.ts"
}
```

Note: Version is intentionally omitted — JSR reads from `package.json` during publish. The `exports` points to TypeScript source; JSR transpiles and serves types natively, no build step needed.

- [ ] **Step 2: Commit**

```bash
cd <sdk-repo-root>
git add jsr.json
git commit -m "chore: add JSR config for Deno/edge runtime publishing"
```

---

## Task 4: Add Secretlint

**Files:**
- Create: `<sdk-repo-root>/.secretlintrc.json`
- Create: `<sdk-repo-root>/scripts/secretlint-staged.mjs`
- Create: `<sdk-repo-root>/scripts/secretlint-repo.mjs`

- [ ] **Step 1: Create `.secretlintrc.json`**

```json
{
  "rules": [
    {
      "id": "@secretlint/secretlint-rule-preset-recommend"
    }
  ],
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/.changeset/README.md",
    "**/*.test.ts",
    "**/*.spec.ts",
    "pnpm-lock.yaml"
  ]
}
```

- [ ] **Step 2: Create `scripts/secretlint-staged.mjs`**

```javascript
import { execFileSync } from 'node:child_process';

const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
})
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean);

if (stagedFiles.length === 0) {
  process.exit(0);
}

execFileSync('pnpm', ['exec', 'secretlint', ...stagedFiles], {
  stdio: 'inherit',
});
```

- [ ] **Step 3: Create `scripts/secretlint-repo.mjs`**

```javascript
import { execFileSync } from 'node:child_process';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .map((file) => file.trim())
  .filter(Boolean);

if (trackedFiles.length === 0) {
  process.exit(0);
}

execFileSync('pnpm', ['exec', 'secretlint', ...trackedFiles], {
  stdio: 'inherit',
});
```

- [ ] **Step 4: Wire secretlint into Husky pre-commit**

Check if `.husky/pre-commit` exists:

```bash
ls <sdk-repo-root>/.husky/
```

If it doesn't exist, create it with:

```bash
cd <sdk-repo-root>
mkdir -p .husky
cat > .husky/pre-commit << 'EOF'
pnpm exec lint-staged
node scripts/secretlint-staged.mjs
EOF
chmod +x .husky/pre-commit
```

If it already exists, append `node scripts/secretlint-staged.mjs` to it.

- [ ] **Step 5: Verify secretlint runs clean on the repo**

```bash
cd <sdk-repo-root>
pnpm secret:scan
```

Expected: exits 0, no secrets found.

- [ ] **Step 6: Commit**

```bash
cd <sdk-repo-root>
git add .secretlintrc.json scripts/ .husky/
git commit -m "chore: add secretlint for credential scanning"
```

---

## Task 5: Rewrite CI Workflow

**Files:**
- Modify: `<sdk-repo-root>/.github/workflows/ci.yml`

- [ ] **Step 1: Replace `ci.yml` entirely**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v5.0.0

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: '24'

      - run: pnpm install --frozen-lockfile

      - run: pnpm test -- --run --coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@57e3a136b779b570ffcdbf80b3bdc90e7fab3de2 # v6.0.0
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          fail_ci_if_error: false

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v5.0.0

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: '24'

      - run: pnpm install --frozen-lockfile

      - run: pnpm lint

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v5.0.0

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: '24'

      - run: pnpm install --frozen-lockfile

      - run: pnpm secret:scan

      - run: pnpm knip:check
```

- [ ] **Step 2: Commit**

```bash
cd <sdk-repo-root>
git add .github/workflows/ci.yml
git commit -m "ci: modernize CI — Node 24, pin actions, split jobs, add security scan"
```

---

## Task 6: Add Release Workflow and Remove publish.yml

**Files:**
- Create: `<sdk-repo-root>/.github/workflows/release.yml`
- Delete: `<sdk-repo-root>/.github/workflows/publish.yml`

- [ ] **Step 1: Create `release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions: {}

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm
    permissions:
      contents: write
      pull-requests: write
      id-token: write
      attestations: write
    steps:
      - name: Generate app token
        id: app-token
        uses: actions/create-github-app-token@df432ceedc7162793a195dd1713ff69aefc7379e # v2.0.6
        with:
          app-id: ${{ secrets.RELEASE_APP_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}

      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0
          token: ${{ steps.app-token.outputs.token }}

      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v5.0.0

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install --frozen-lockfile

      - run: pnpm quality

      - name: Create release PR or publish packages
        id: changesets
        uses: changesets/action@6a0a831ff30acef54f2c6aa1cbbc1096b066edaf # v1.7.0
        with:
          commit: 'chore: release packages'
          title: 'chore: release packages'
          version: pnpm run version
          publish: pnpm run release
        env:
          GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
          NPM_CONFIG_PROVENANCE: 'true'
```

Note: The `release` script in `package.json` calls `changeset publish && npx jsr publish`, so JSR is published automatically as part of the publish step.

- [ ] **Step 2: Delete `publish.yml`**

```bash
cd <sdk-repo-root>
git rm .github/workflows/publish.yml
```

- [ ] **Step 3: Commit**

```bash
cd <sdk-repo-root>
git add .github/workflows/release.yml
git commit -m "ci: replace git-tag publish with changesets release workflow"
```

---

## Task 7: Add Security Workflows (CodeQL + Scorecard)

**Files:**
- Create: `<sdk-repo-root>/.github/workflows/codeql.yml`
- Create: `<sdk-repo-root>/.github/workflows/scorecard.yml`

- [ ] **Step 1: Create `codeql.yml`**

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'

permissions:
  contents: read

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    strategy:
      matrix:
        language: ['javascript-typescript']

    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - name: Initialize CodeQL
        uses: github/codeql-action/init@c10b8064de6f491fea524254123dbe5e09572f13 # v4.35.1
        with:
          languages: ${{ matrix.language }}

      - name: Autobuild
        uses: github/codeql-action/autobuild@c10b8064de6f491fea524254123dbe5e09572f13 # v4.35.1

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@c10b8064de6f491fea524254123dbe5e09572f13 # v4.35.1
        with:
          category: '/language:${{ matrix.language }}'
```

- [ ] **Step 2: Create `scorecard.yml`**

```yaml
name: Scorecard

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'

permissions: read-all

jobs:
  analysis:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write

    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Run analysis
        uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true

      - name: Upload to code-scanning
        uses: github/codeql-action/upload-sarif@c10b8064de6f491fea524254123dbe5e09572f13 # v4.35.1
        with:
          sarif_file: results.sarif
```

- [ ] **Step 3: Commit**

```bash
cd <sdk-repo-root>
git add .github/workflows/codeql.yml .github/workflows/scorecard.yml
git commit -m "ci: add CodeQL security scanning and OSSF Scorecard"
```

---

## Task 8: Add Auto-Approve Workflow

**Files:**
- Create: `<sdk-repo-root>/.github/workflows/auto-approve.yml`

- [ ] **Step 1: Create `auto-approve.yml`**

```yaml
name: Auto Approve

on:
  pull_request_target:
    branches: [main]

permissions: {}

jobs:
  auto-approve:
    runs-on: ubuntu-latest
    if: github.actor == 'medal-social-release-bot[bot]'
    steps:
      - name: Generate token from Medal Bot app
        id: app-token
        uses: actions/create-github-app-token@7bd03711494f032dfa3be3558f7dc8787b0be333 # v4
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}

      - uses: hmarr/auto-approve-action@8f929096a962e83ccdfa8afcf855f39f12d4dac7 # v4
        with:
          github-token: ${{ steps.app-token.outputs.token }}

      - name: Enable auto-merge for release PRs
        if: github.actor == 'medal-social-release-bot[bot]'
        run: gh pr merge --auto --squash "${{ github.event.pull_request.html_url }}"
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
```

- [ ] **Step 2: Commit**

```bash
cd <sdk-repo-root>
git add .github/workflows/auto-approve.yml
git commit -m "ci: add auto-approve for release bot PRs"
```

---

## Task 9: Copy gh-aw Lock Workflows from Pilot

These are auto-generated by `gh aw compile` and must be copied verbatim. Do NOT edit them manually — they contain compiled agent definitions.

**Files to copy from `<pilot-repo-root>/.github/workflows/` to `<sdk-repo-root>/.github/workflows/`:**
- `auto-triage-issues.lock.yml`
- `breaking-change-checker.lock.yml`
- `daily-workflow-updater.lock.yml`
- `pr-triage-agent.lock.yml`
- `test-quality-sentinel.lock.yml`

- [ ] **Step 1: Copy all five lock workflows**

```bash
PILOT=(<pilot-repo-root>/.github/workflows)
SDK=(<sdk-repo-root>/.github/workflows)

cp "$PILOT/auto-triage-issues.lock.yml" "$SDK/"
cp "$PILOT/breaking-change-checker.lock.yml" "$SDK/"
cp "$PILOT/daily-workflow-updater.lock.yml" "$SDK/"
cp "$PILOT/pr-triage-agent.lock.yml" "$SDK/"
cp "$PILOT/test-quality-sentinel.lock.yml" "$SDK/"
```

- [ ] **Step 2: Verify all five files exist**

```bash
ls <sdk-repo-root>/.github/workflows/*.lock.yml
```

Expected: 5 files listed.

- [ ] **Step 3: Commit**

```bash
cd <sdk-repo-root>
git add .github/workflows/*.lock.yml
git commit -m "ci: add gh-aw agentic workflow suite (auto-triage, breaking-change, pr-triage, test-sentinel, updater)"
```

---

## Task 10: Final Verification and PR

- [ ] **Step 1: Run full quality check**

```bash
cd <sdk-repo-root>
pnpm quality
```

Expected: lint passes, all tests pass.

- [ ] **Step 2: Run secret scan**

```bash
cd <sdk-repo-root>
pnpm secret:scan
```

Expected: exits 0, no secrets found.

- [ ] **Step 3: Run knip check**

```bash
cd <sdk-repo-root>
pnpm knip:check
```

Expected: exits 0 (or lists only expected unused items if any — address them if found).

- [ ] **Step 4: Verify changeset version + release scripts are parseable**

```bash
cd <sdk-repo-root>
pnpm changeset status
```

Expected: "No changesets found" (that's correct for a fresh setup).

- [ ] **Step 5: Push branch and open PR against Medal-Social/MedalSocial main**

```bash
cd <sdk-repo-root>
git push origin HEAD
gh pr create \
  --title "chore: mainstream release pipeline — changesets, JSR, full workflow suite" \
  --body "Brings SDK to Pilot-level release quality. See pilot docs/superpowers/specs/2026-04-21-medalsocial-sdk-mainstreaming-design.md for full spec."
```
