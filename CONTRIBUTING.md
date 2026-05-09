# Contributing to Pilot

Thanks for your interest in contributing to Pilot!

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Build all packages: `pnpm build`
4. Run tests: `pnpm test`

## Development

```bash
pnpm dev          # Start CLI in watch mode
pnpm quality      # Lint, typecheck, repo tests, package tests
pnpm test         # Run tests
pnpm test:repo    # Verify repo guardrails (hooks, workflows, metadata)
pnpm lint         # Check code style
pnpm lint:fix     # Auto-fix code style
pnpm secret:lint  # Scan the repo for committed secrets
pnpm knip:check   # Detect unused files, exports, and dependencies
```

## Project Structure

```
packages/
  cli/              # Main CLI package (@medalsocial/pilot)
  plugins/
    kit/            # Machine management plugin
    sanity/         # CMS plugin
    pencil/         # Design tools plugin
```

## Pull Requests

- Create a feature branch from `main`
- Write tests for new functionality
- Ensure all tests pass before submitting
- Follow existing code conventions (TypeScript strict, Biome linting)
- Add a changeset with `pnpm changeset` for release-worthy changes unless the PR is explicitly internal-only
- Do not commit generated `dist/` or `coverage/` artifacts

## Code Style

- TypeScript strict mode, no `any`
- Single quotes, 2-space indent, trailing commas ES5
- Use `import type` for type-only imports
- Use structured logger instead of `console.log`

## Reporting Issues

Use [GitHub Issues](https://github.com/Medal-Social/pilot/issues) to report bugs or request features.

## Developer Certificate of Origin (DCO)

All contributors must sign off their commits to certify they have the right to submit the code under the project's license. Add `Signed-off-by` to your commits:

```bash
git commit -s -m "feat: add new feature"
```

This adds a line like:

```
Signed-off-by: Your Name <your@email.com>
```

You can configure git to do this automatically:

```bash
git config --global commit.signoff true
```

## Coding Standards

Pilot uses [Biome](https://biomejs.dev/) as its linter and formatter. The configuration is in [`biome.json`](biome.json).

**Key rules:**
- Single quotes, 2-space indentation, 100-character line width, trailing commas ES5
- `import type` for type-only imports (enforced by Biome)
- TypeScript strict mode — no `any`, use `unknown` + type narrowing
- No `console.log` — use the structured logger (`getLogger('scope')`)
- Error codes via `PilotError(errorCodes.CODE, 'message')`, never raw throws
- All colors via the design token system (`colors.ts`), never hardcoded hex

**Enforcement:** Biome runs automatically in the pre-commit hook (`.husky/pre-commit`) and in CI. PRs that fail linting cannot be merged.

## AI-Assisted Changes

AI assistance is allowed, but contributors are responsible for the final patch.

- Review every AI-generated change before committing it
- Write or update tests for any behavior change
- Use your own commit message and PR summary; do not paste raw model transcripts
- Call out security-sensitive changes explicitly when touching auth, install flows, shell execution, manifests, or permissions

## Release Discipline

- Pilot uses Changesets for releases; create one with `pnpm changeset`
- Conventional commits are enforced through the `commit-msg` hook
- `pnpm quality` is the baseline maintainer check before opening a PR
- Releases are published only through GitHub Actions after the controlled release workflow validates the branch

## Testing Policy

**All new features must include tests.** Bug fixes must include a regression test that fails without the fix and passes with it.

- Co-locate tests: `Component.tsx` → `Component.test.tsx`
- Use `ink-testing-library` for React Ink component tests
- Use `vitest` with `describe`/`it`/`expect`
- Coverage target is **100%** — we aim for full coverage on all new code
- Hard minimums enforced by CI: **95% statements, 90% branches, 100% functions**
- PRs that drop coverage below these thresholds are blocked

**Regression tests:** When fixing a bug, first write a test that reproduces the bug (it should fail), then fix the bug and verify the test passes. This prevents the same bug from recurring.

## Code Review Policy

All pull requests require approval from at least one reviewer who is not the author before merging. This is enforced by GitHub branch protection on the `main` branch.

**Reviewers should check:**
- Code correctness and edge cases
- Test coverage for new functionality
- Documentation updates for behavior changes
- Security implications (input validation, credential handling)
- Adherence to coding standards (Biome will catch most style issues)
- Whether release-worthy changes include a changeset
- Whether generated output or copied AI content slipped into the PR

## Documentation Policy

PRs that change user-facing behavior must update the relevant documentation:

- New commands → update the Commands table in `README.md`
- New features → update the Feature Tracker in `README.md`
- Changed CLI output → update examples in docs
- Security changes → update `SECURITY.md` or `docs/SECURITY-EXPECTATIONS.md`

The PR template checklist includes a documentation check.

## Manifest and Install-Script Policy

Changes to plugin manifests, install scripts, machine bootstrap logic, or permission declarations need extra scrutiny.

- Plugin manifests and config files must remain schema-validated
- Shell execution paths must stay explicit and reviewable; do not add unchecked dynamic shell snippets
- Permission changes must be called out in the PR summary
- Install and bootstrap changes should include a reviewer test path or smoke-test notes

## Accessibility

Pilot follows CLI accessibility best practices:

- **Color contrast:** All colors come from the design token system (`colors.ts`), which provides sufficient contrast in both light and dark terminals
- **No color-only information:** Status indicators use symbols (✓, ✗, ○, ◆) alongside color
- **Screen reader compatibility:** Ink components produce plain text output compatible with terminal screen readers
- **NO_COLOR support:** Planned — will respect the `NO_COLOR` environment variable
