# Subplan 07: Platform + Distribution

> **For agentic workers:** Use superpowers:subagent-driven-development

**Goal:** Platform compliance (XDG directories, NO_COLOR, shell completions) and build/release pipeline (tsup dual output, changesets versioning, GitHub Actions CI + release).

**Architecture:** pnpm monorepo with a `cli` package (React Ink + Commander.js) and `plugins/` packages (@medalsocial/kit, sanity, pencil). The plugin system loads manifests, registers MCP servers and slash commands. The AI layer uses Vercel AI SDK with Claude for streaming chat, tool calling, and crew auto-routing. Training generates AGENTS.md / CLAUDE.md consumed by Claude Code, Codex, and any MCP-aware tool.

**Tech Stack:** TypeScript (strict), pnpm workspaces, React Ink, Commander.js, Vercel AI SDK, @ai-sdk/anthropic, Zod, Vitest, ink-testing-library, Biome

**Depends on:** [01-foundation.md](01-foundation.md) through [06-production-hardening.md](06-production-hardening.md)

---

## Phase 13: Platform Compliance

### Task 38: XDG Base Directory compliance

**Files:**
- Create: `packages/cli/src/lib/paths.ts`
- Modify: `packages/cli/src/state.ts` — use paths.ts instead of hardcoded ~/.pilot
- Test: `packages/cli/src/lib/paths.test.ts`

Config/data/cache directories follow platform conventions:
- Linux: `XDG_CONFIG_HOME/pilot` (default `~/.config/pilot`), `XDG_DATA_HOME/pilot` (default `~/.local/share/pilot`)
- macOS: `~/Library/Application Support/pilot`
- Fallback: `~/.pilot/` if nothing else works
- `PILOT_HOME` env var overrides everything (useful for testing + custom setups)

```ts
// packages/cli/src/lib/paths.ts
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export function getPilotDir(): string {
  if (process.env.PILOT_HOME) return process.env.PILOT_HOME;

  const os = platform();
  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'pilot');
  }
  if (os === 'linux') {
    const xdgData = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
    return join(xdgData, 'pilot');
  }
  return join(homedir(), '.pilot');
}

export function getConfigDir(): string {
  if (process.env.PILOT_HOME) return process.env.PILOT_HOME;

  const os = platform();
  if (os === 'linux') {
    const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
    return join(xdgConfig, 'pilot');
  }
  return getPilotDir();
}

export function getSkillsDir(): string {
  return join(getPilotDir(), 'skills');
}

export function getKnowledgeDir(): string {
  return join(getPilotDir(), 'knowledge');
}

export function getAnalyticsDir(): string {
  return join(getPilotDir(), 'analytics');
}
```

All tasks that reference `~/.pilot/` must use `getPilotDir()` instead. Update state.ts, deployer.ts, config files.

---

### Task 39: NO_COLOR / FORCE_COLOR support

**Files:**
- Modify: `packages/cli/src/colors.ts` — respect NO_COLOR and FORCE_COLOR env vars
- Test: `packages/cli/src/colors.test.ts` — add env var tests

```ts
// Add to colors.ts
export function shouldUseColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return process.stdout.isTTY ?? false;
}

export function resolveColor(color: string): string {
  return shouldUseColor() ? color : '';
}
```

React Ink respects `NO_COLOR` natively, but any direct ANSI usage in logging or install script must check this. The `colors.ts` module exports `shouldUseColor()` for anything outside Ink.

---

### Task 40: Shell completions

**Files:**
- Create: `packages/cli/src/completions.ts`
- Modify: `packages/cli/src/bin/pilot.ts` — add `pilot completions` command

```ts
// packages/cli/src/completions.ts
const COMMANDS = ['up', 'crew', 'training', 'plugins', 'update', 'status', 'help'];

export function generateBashCompletions(): string {
  return `_pilot() {
  local cur=\${COMP_WORDS[COMP_CWORD]}
  COMPREPLY=($(compgen -W "${COMMANDS.join(' ')}" -- "$cur"))
}
complete -F _pilot pilot`;
}

export function generateZshCompletions(): string {
  return `#compdef pilot
_pilot() {
  local -a commands
  commands=(
${COMMANDS.map((c) => `    '${c}:${c} command'`).join('\n')}
  )
  _describe 'command' commands
}
_pilot`;
}

export function generateFishCompletions(): string {
  return COMMANDS.map(
    (c) => `complete -c pilot -n '__fish_use_subcommand' -a '${c}'`
  ).join('\n');
}
```

`pilot completions bash|zsh|fish` outputs the completion script. Install instructions shown in `pilot help`.

---

## Phase 14: Build + Release Pipeline

### Task 41: Switch build to tsup (dual CJS/ESM + DTS)

**Files:**
- Modify: `packages/cli/package.json` — add tsup, update build script, add exports field
- Create: `packages/cli/tsup.config.ts`
- Modify: `packages/plugins/kit/package.json` — same
- Create: `packages/plugins/kit/tsup.config.ts`
- Modify: `packages/plugins/sanity/package.json`
- Modify: `packages/plugins/pencil/package.json`

- [ ] **Step 1: Install tsup across workspace**

```bash
pnpm add -Dw tsup
```

- [ ] **Step 2: Create tsup config for cli package**

```ts
// packages/cli/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin/pilot.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

- [ ] **Step 3: Create tsup config for plugin packages**

```ts
// packages/plugins/kit/tsup.config.ts (same pattern for sanity, pencil)
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
```

- [ ] **Step 4: Update package.json exports fields**

```json
// packages/plugins/kit/package.json (same pattern for sanity, pencil)
{
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: Update turbo.json for tsup outputs**

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 6: Add publint check**

```bash
pnpm add -Dw publint
```

Add to root `package.json`:
```json
{
  "scripts": {
    "lint:packages": "turbo publint",
    "quality": "pnpm lint && pnpm typecheck && pnpm lint:packages && pnpm test && pnpm test:e2e"
  }
}
```

Add to each plugin package.json:
```json
{
  "scripts": {
    "publint": "publint"
  }
}
```

- [ ] **Step 7: Verify build**

```bash
pnpm build
pnpm lint:packages
```

Expected: All packages build with dual output, publint passes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: switch build to tsup with dual CJS/ESM output and publint validation"
```

---

### Task 42: Changesets for multi-package versioning

**Files:**
- Create: `.changeset/config.json`
- Modify: `package.json` — add changeset scripts

- [ ] **Step 1: Install changesets**

```bash
pnpm add -Dw @changesets/cli @changesets/changelog-github
npx changeset init
```

- [ ] **Step 2: Configure changesets**

```json
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    { "repo": "Medal-Social/pilot" }
  ],
  "commit": false,
  "fixed": [],
  "linked": [
    ["@medalsocial/pilot", "@medalsocial/kit", "@medalsocial/sanity", "@medalsocial/pencil"]
  ],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

- [ ] **Step 3: Add changeset scripts**

Add to root `package.json`:
```json
{
  "scripts": {
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && changeset publish"
  }
}
```

- [ ] **Step 4: Document changeset workflow in CONTRIBUTING.md**

Append to CONTRIBUTING.md:
```markdown
## Making Changes

After making changes, create a changeset:

\`\`\`bash
pnpm changeset
\`\`\`

Select the packages you changed, choose the bump type (patch/minor/major), and write a human-readable summary. This gets committed with your PR.

Changelogs are auto-generated from changesets on release.
```

- [ ] **Step 5: Commit**

```bash
git add .changeset/ package.json CONTRIBUTING.md
git commit -m "feat: add changesets for multi-package versioning"
```

---

### Task 43: GitHub Actions release pipeline

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create CI workflow (runs on every PR)**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  quality:
    name: Quality Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm lint:packages
      - run: pnpm test -- --coverage
      - run: pnpm test:e2e
      - run: pnpm secret:lint
      - run: pnpm dead-code
```

- [ ] **Step 2: Create release workflow (runs on main when changesets exist)**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm release
          title: 'chore: version packages'
          commit: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

  build-binary:
    name: Build Binaries
    needs: release
    if: github.ref == 'refs/heads/main'
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, macos-13]
        include:
          - os: ubuntu-latest
            target: linux-x64
          - os: macos-latest
            target: darwin-aarch64
          - os: macos-13
            target: darwin-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: bash scripts/build-binary.sh
      - uses: actions/upload-artifact@v4
        with:
          name: pilot-${{ matrix.target }}
          path: packages/cli/dist/bin/pilot
```

- [ ] **Step 3: Update README.md Feature Tracker**

Update the Feature Tracker in README.md — change status from "Planned" to "Done" for features completed in this subplan.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit -m "feat: add CI quality gate and release pipeline with changesets"
```

---

## Self-Review

| Spec Section | Task |
|---|---|
| XDG Base Directory compliance | Task 38 |
| NO_COLOR / FORCE_COLOR support | Task 39 |
| Shell completions (bash, zsh, fish) | Task 40 |
| tsup dual CJS/ESM build + publint | Task 41 |
| Changesets multi-package versioning | Task 42 |
| GitHub Actions CI + release pipeline | Task 43 |
