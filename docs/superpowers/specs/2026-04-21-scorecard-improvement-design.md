# OpenSSF Scorecard Improvement Design

**Date:** 2026-04-21
**Target:** github.com/Medal-Social/Pilot
**Current score:** 7.5/10
**Projected score after changes:** ~8.8–9.2

## Background

The Scorecard runs weekly and on every push to main via `.github/workflows/scorecard.yml`. Several checks score 0 or -1 not because of missing implementation, but due to detection gaps and configuration placement. This spec addresses the fixable items in a single PR.

## Checks addressed

| Check | Current | After | Method |
|---|---|---|---|
| CII-Best-Practices | 0 | 10 | Badge already in README; next scan picks it up |
| Pinned-Dependencies | 9 | 10 | Keep pinned manifests and consolidate dependency maintenance |
| Signed-Releases | 0 | ~8 | Comes automatically after PR #36 → release fires |
| Code-Review | 6 | ~8–9 | Improves naturally as PRs flow through with branch protection |
| Packaging | -1 | -1 | Leave as-is; excluded from average, not hurting score |
| Branch-Protection | -1 | ? | May self-resolve on next scorecard run |
| Maintained | 0 | 0 | Time-based; auto-resolves ~July 2026 |
| Contributors | 3 | 3 | Needs external contributors; not engineerable |

## Changes

### 1. Dependency maintenance policy

**File:** `GOVERNANCE.md`

Document that dependencies are kept current through consolidated maintenance PRs. Manifests and lockfiles remain pinned and reviewed together instead of relying on automated dependency update PR scheduling.

Evidence for Scorecard should come from pinned manifests, lockfiles, and recent consolidated dependency maintenance PRs.

### 2. Move CODEOWNERS to `.github/CODEOWNERS`

**File:** `.github/CODEOWNERS` (new) + delete root `CODEOWNERS`

GitHub honours CODEOWNERS in three locations: root, `docs/`, and `.github/`. Scorecard's Code-Review analysis specifically looks in `.github/CODEOWNERS`. Moving the file (no content changes) ensures scorecard finds and attributes it correctly.

Content stays identical to the current root `CODEOWNERS`:

```
# Default: require review from both maintainers
* @alioftech @adaadev

# Plugin manifests need careful review
packages/plugins/*/plugin.toml @alioftech @adaadev

# Skill deployment and security
packages/cli/src/deploy/ @alioftech @adaadev
packages/cli/src/skills/ @alioftech @adaadev

# CI and release pipeline
.github/ @alioftech @adaadev
```

### 3. Fix cosign verification command in `SECURITY.md`

**File:** `SECURITY.md`

The `--certificate-identity-regexp` currently references `refs/tags/v.*` but release tags follow the Changesets format: `@medalsocial/pilot@0.1.x`. The regexp won't match, causing verification to fail for anyone following the documented process.

**Before:**
```
--certificate-identity-regexp "https://github.com/Medal-Social/Pilot/.github/workflows/build-binaries.yml@refs/tags/v.*"
```

**After:**
```
--certificate-identity-regexp "https://github.com/Medal-Social/Pilot/.github/workflows/build-binaries.yml@refs/tags/@medalsocial/pilot@.*"
```

### 4. Force scorecard re-run after merge

After the PR lands, manually trigger the `Scorecard` workflow via `gh workflow run scorecard.yml`. This picks up:
- CII Best Practices badge (already in README since April 10)
- CODEOWNERS in the new location
- Any Branch-Protection -1 internal error resolution

## What this does not change

- Release workflow — publishing stays via `changesets/action`; Packaging -1 is excluded from the score average so leaving it is neutral
- Branch protection settings — already well-configured; `required_signatures` (signed commits) skipped as it adds friction for contributors
- Any test or lint workflows

## Projected score breakdown

After this PR + one release firing `build-binaries.yml`:

```
Maintained:            0  (time, ~July 2026)
Dependency-Update:    10
Security-Policy:      10
Code-Review:        8–9  (improves as new PRs flow through)
Binary-Artifacts:     10
Dangerous-Workflow:   10
Token-Permissions:    10
Pinned-Dependencies:  10  ← fixed
CII-Best-Practices:   10  ← fixed (badge scan)
Signed-Releases:      ~8  ← fixed (after release)
License:              10
Branch-Protection:   ?/-1 (may self-resolve)
Fuzzing:              10
Vulnerabilities:      10
SAST:                 10
Contributors:          3  (needs external contributors)
CI-Tests:             10

Estimated total: ~8.8–9.2
```

## Out of scope

- `Contributors` improvement — requires attracting external contributors from other organisations
- `Maintained` improvement — automatic after ~90 days of commit activity
- Changesets release pipeline restructuring for Packaging detection
