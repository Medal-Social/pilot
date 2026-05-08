# Pilot CLI

Medal Social's AI-powered CLI platform. Your AI crew, ready to fly.

## Commands

```bash
# Workspace-wide
pnpm install                              # bootstrap deps
pnpm build                                # turbo: build all packages
pnpm test                                 # turbo: run all tests
pnpm lint                                 # biome check (warnings OK, errors block)
pnpm lint:fix                             # biome check --write (auto-fix)
pnpm dev                                  # filter to cli dev mode

# Per-package (preferred — much faster than full workspace)
pnpm --filter @medalsocial/pilot test <pattern> -- --run
pnpm --filter @medalsocial/kit test -- --run
pnpm --filter @medalsocial/kit exec tsc --noEmit

# Run the locally-built pilot binary
node packages/cli/dist/bin/pilot.js <command>
# Or globally link after `pnpm build`:
cd packages/cli && npm link
```

Pre-commit (husky): runs `pnpm lint` + `pnpm test`. Biome warnings (e.g. unused
admin imports on pre-existing files) are tolerated; errors block. Don't use
`--no-verify` — fix the underlying issue.

## Project Overview

- **Monorepo**: pnpm workspaces + Turborepo
- **CLI**: React Ink + Commander.js
- **AI**: Vercel AI SDK + @ai-sdk/anthropic (Claude)
- **Plugins**: @medalsocial/kit (sanity, pencil are planned)
- **Build**: tsc (ESM) + bun build --compile (binary)
- **Test**: Vitest + ink-testing-library + E2E
- **Lint**: Biome (strict, matching medal-monorepo)
- **Release**: Changesets + GitHub Actions

## Code Conventions

- TypeScript strict mode, no `any` (use `unknown` + type narrowing)
- Use `import type` for type-only imports (enforced by Biome)
- Single quotes, 2-space indent, 100-char line width, trailing commas ES5
- No `console.log` for user output — use `process.stdout.write` (CLI output) or `console.error` (errors). There is no shared logger.
- Error codes via `PilotError(errorCodes.CODE, 'message')`, never raw throws to users
- All colors via design token system (`colors.ts`), never hardcoded hex in components

## Testing

- TDD: write failing test first, then implement
- Co-located tests: `Step.tsx` → `Step.test.tsx`
- ink-testing-library for component tests
- E2E tests in `tests/e2e/` with isolated `PILOT_HOME`
- Coverage target: 100% (hard minimums: 95% statements, 90% branches, 100% functions)

## Changeset Automation

Every PR is classified by `scripts/changeset-auto.mjs` (run from the `Changeset
Automation` workflow on pull_request and issue_comment events). It decides
whether a `.changeset/*.md` is needed, infers the semver bump from the
conventional commits, and writes a stable `auto-<pr>-<sha7>-<slug>.md` file.

**How classification works:**

- Path-only PRs (`docs/**`, `tests/**`, `.github/**`, `scripts/**`, root
  `*.md`, lockfiles, etc.) → no changeset.
- `packages/plugins/kit/**` alone → no changeset (kit is `private: true`).
- Conventional commits drive the bump: `feat:` → minor, `fix:`/`perf:`/`revert:`
  → patch, `feat!:` or `BREAKING CHANGE:` → major. Ambiguous PRs (no
  conventional commit and no override) exit 2 and route to the AI fallback
  (`changeset-ai-fallback.yml`).
- Dependency maintenance PRs: include an explicit changeset when publishable runtime
  dependency updates affect `@medalsocial/pilot`; dev-only updates normally skip.

**Comment commands (post on the PR):**

- `/changeset` — re-run the classifier immediately.
- `/changeset <type>: <desc>` — override both the type (`patch`/`minor`/`major`)
  and the description, e.g. `/changeset patch: fix keyboard nav`.
- `/skip-changeset` — declare the PR intentionally needs no changeset.

**Labels:**

- `no-changeset` — skip (same as `/skip-changeset`).
- `patch` / `minor` / `major` — force the bump type, overriding inference.

**Merge gate:** `ci / changeset-required` runs `pnpm changeset:check` on every
PR and fails merge if the classifier says a changeset is needed but none is
present on the branch. To bypass, use one of the commands or labels above.

## Architecture

```
packages/
  cli/              ← entry point, REPL, screens, components, AI layer
  plugins/
    kit/            ← @medalsocial/kit (machine management)
    sanity/         ← @medalsocial/sanity (CMS)
    pencil/         ← @medalsocial/pencil (design tools)
```

## Key Patterns

- **Split-panel UI**: canonical layout for pilot up, training, plugins, crew (SplitPanel + TabBar)
- **Plugin manifest**: `plugin.toml` with Zod validation, declares commands + MCP servers + permissions
- **Crew routing**: root agent auto-routes to crew leads (Brand, Marketing, Tech, CS, Sales)
- **Skill deployment**: `~/.pilot/skills/` with symlink to `~/.claude/skills/pilot`
- **CLAUDE.md routing**: appended during install, routes `/pilot` to crew
- **Smart updates**: manifest.json checksums protect user-modified files
- **Design tokens**: from Pencil (05-cli.pen), light/dark theme via T:mode

## Kit Plugin (machine management)

Source: `packages/plugins/kit/` (the plugin) + `packages/cli/src/commands/kit.ts` (the dispatcher that wires `pilot kit ...` subcommands).

- `pilot kit init [machine]` — bootstrap a fresh machine
- `pilot kit new` — scaffold a new kit repo
- `pilot kit update` — pull + rebuild (with progress UI)
- `pilot kit status [--json]` — health checks (TTY = human, piped = JSON)
- `pilot kit apps add|remove|list [cask:NAME|brew:NAME]`
- `pilot kit edit` — open machine .nix in $EDITOR (interactive, real TTY)
- `pilot kit config show|path` — inspect loaded config

Errors use `KitError(errorCodes.KIT_*, detail?)` — per-plugin pattern, not wrapped in `PilotError`. Each plugin owns its own error namespace.

`Exec` interface (in `shell/exec.ts`) is the only place that touches `child_process`. Pass `interactive: true` for commands that need a real TTY (editors, prompts) — otherwise stdin/stdout/stderr are piped and captured.

Spec: `docs/superpowers/specs/2026-04-20-kit-machine-package-v1-design.md`

## User-Facing Language

- Never expose: package managers (Nix, npm), file paths, version numbers, checksums
- Frame as benefits: "Design editor ready" not "Installed @pencil/core v3.2.1"
- Aviation metaphor: crew, flight, cockpit, takeoff
- Medal-branded names: `pilot up pencil` not `pilot up figma-plugin`

## Feature Tracker

When a new spec or plan is created, update the Feature Tracker table in README.md:
- Add new features with status (Planned / In Progress / Done)
- Link to the relevant spec or plan document
- Update status as features are implemented and merged

The tracker is the single source of truth for what Pilot can do and what's coming next.

## Skill Routing

For brand/marketing/content/support/sales/machine-setup requests, invoke `/pilot`. The root agent routes to the right crew lead automatically.
