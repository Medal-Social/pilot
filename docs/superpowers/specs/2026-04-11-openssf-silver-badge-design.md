# OpenSSF Silver Badge — Design Spec

**Date:** 2026-04-11
**Goal:** Meet all OpenSSF Best Practices Silver criteria for [project 12447](https://www.bestpractices.dev/en/projects/12447/silver)
**Approach:** Criterion-by-criterion — each item gets its doc/code/badge-answer in one pass

---

## Summary

44 criteria total. ~18 are already met or need badge-page answers only. ~16 need new documentation. ~4 need engineering work. ~6 are N/A.

### Work Categories

| Category | Count | Examples |
|----------|-------|---------|
| Badge answer only (already met) | 18 | coding_standards_enforced, external_dependencies, automated_integration_testing |
| New documentation | 16 | governance, code_of_conduct, roadmap, assurance_case |
| Engineering work | 4 | signed_releases (Sigstore), test_coverage (80%), build_repeatable, version_tags_signed |
| Mark N/A | 6 | build_standard_variables, sites_password_security, installation_standard_variables |

---

## Section 1: Basics

### 1. `governance` (MUST)
**Status:** Not documented
**Action:** Create `GOVERNANCE.md`
- Decision model: Benevolent Dictator with Medal Social org as backstop
- Decisions made via GitHub issues/PRs
- Final authority: project lead
- Org admins can appoint successors
**Deliverable:** `/GOVERNANCE.md`

### 2. `roles_responsibilities` (MUST)
**Status:** Not documented
**Action:** Add to `GOVERNANCE.md`
- Project Lead: roadmap, releases, security response
- Contributor: PRs, issues, docs
- Org Admin: infrastructure, succession, access management
**Deliverable:** Section in `/GOVERNANCE.md`

### 3. `access_continuity` (MUST)
**Status:** Covered by org ownership, not documented
**Action:** Add to `GOVERNANCE.md`
- Medal Social org owns GitHub repo + npm packages
- Org admins can grant access if lead is unavailable
- No single point of failure at infrastructure level
**Deliverable:** Section in `/GOVERNANCE.md`

### 4. `bus_factor` (SHOULD)
**Status:** Unmet — single active maintainer
**Action:** Acknowledge in `GOVERNANCE.md`. Mitigated by org ownership. Mark as Unmet on badge (SHOULD, won't block Silver).
**Deliverable:** Section in `/GOVERNANCE.md`

### 5. `code_of_conduct` (MUST)
**Status:** Missing
**Action:** Create `CODE_OF_CONDUCT.md` — adopt Contributor Covenant v2.1
**Deliverable:** `/CODE_OF_CONDUCT.md`

### 6. `dco` (SHOULD)
**Status:** Not implemented
**Action:** Add DCO section to `CONTRIBUTING.md` — require `Signed-off-by` in commits. Optionally add DCO bot.
**Deliverable:** Section in `/CONTRIBUTING.md`

### 7. `documentation_roadmap` (MUST)
**Status:** Feature tracker exists in README, no standalone roadmap
**Action:** Create `ROADMAP.md` covering next 12 months. Pull from feature tracker + planned work (skill security, plugin ecosystem, crew expansion).
**Deliverable:** `/ROADMAP.md`

### 8. `documentation_architecture` (MUST)
**Status:** Brief section in CLAUDE.md, not a proper architecture doc
**Action:** Create `docs/ARCHITECTURE.md` — monorepo structure, CLI entry point → Commander → screens → AI layer, plugin system lifecycle, crew routing, skill deployment, design token system.
**Deliverable:** `/docs/ARCHITECTURE.md`

### 9. `documentation_security` (MUST)
**Status:** SECURITY.md covers reporting, not user expectations
**Action:** Create `docs/SECURITY-EXPECTATIONS.md` — what users can/cannot expect: local-only data, API key handling, no telemetry, plugin permission model, TLS by default, planned plugin sandboxing.
**Deliverable:** `/docs/SECURITY-EXPECTATIONS.md`

### 10. `documentation_quick_start` (MUST)
**Status:** README has install instructions but no guided quick start
**Action:** Add "Quick Start" section to README — install → `pilot up` → first crew interaction. Under 5 minutes, under 5 steps.
**Deliverable:** Section in `/README.md`

### 11. `documentation_current` (MUST)
**Status:** No formal policy
**Action:** Add to `CONTRIBUTING.md` — PRs changing behavior must update relevant docs. Add to PR template checklist.
**Deliverable:** Section in `/CONTRIBUTING.md`, PR template update

### 12. `documentation_achievements` (MUST)
**Status:** Scorecard badge in README
**Action:** Add Silver badge to README within 48h of earning. Add to release checklist in `CONTRIBUTING.md`.
**Deliverable:** Badge page answer + checklist item

### 13. `accessibility_best_practices` (SHOULD)
**Status:** Design token system exists, no formal a11y docs
**Action:** Document in `CONTRIBUTING.md` — CLI accessibility: color contrast via tokens, no color-only information, screen reader-friendly output.
**Deliverable:** Section in `/CONTRIBUTING.md`

### 14. `internationalization` (SHOULD)
**Status:** English-only CLI
**Action:** Mark N/A on badge — CLI targets English-speaking users. Note as future consideration.
**Deliverable:** Badge page answer

### 15. `sites_password_security` (MUST)
**Status:** N/A — project sites don't store passwords
**Action:** Mark N/A on badge page.
**Deliverable:** Badge page answer

---

## Section 2: Change Control

### 16. `maintenance_or_update` (MUST)
**Status:** Rolling release model exists, not documented
**Action:** Document in `GOVERNANCE.md` — single active release line, fixes ship in next release, users upgrade via `pilot update`. No LTS branches.
**Deliverable:** Section in `/GOVERNANCE.md`

---

## Section 3: Reporting

### 17. `vulnerability_report_credit` (MUST)
**Status:** No credit policy
**Action:** Add to `SECURITY.md` — reporters credited in release notes and CHANGELOG unless they request anonymity. Create `docs/SECURITY-CREDITS.md` (empty — no reports in last 12 months).
**Deliverable:** Section in `/SECURITY.md`, `/docs/SECURITY-CREDITS.md`

### 18. `vulnerability_response_process` (MUST)
**Status:** SECURITY.md has basics, needs formalized timeline
**Action:** Expand SECURITY.md with explicit steps: triage (48h) → confirm/reject (7 days) → fix development → coordinated disclosure (90 days) → release + credit.
**Deliverable:** Expanded `/SECURITY.md`

---

## Section 4: Quality

### 19. `coding_standards` (MUST)
**Status:** Biome config exists, documented in CLAUDE.md
**Action:** Create `CONTRIBUTING.md` coding standards section — reference Biome, link to `biome.json`, document key rules.
**Deliverable:** Section in `/CONTRIBUTING.md`

### 20. `coding_standards_enforced` (MUST)
**Status:** Already enforced via pre-commit hooks + CI
**Action:** Badge page answer — reference `.husky/pre-commit` and CI.
**Deliverable:** Badge page answer only

### 21. `build_standard_variables` (MUST)
**Status:** N/A — JS/TS project, not native binaries
**Action:** Mark N/A on badge.
**Deliverable:** Badge page answer

### 22. `build_preserve_debug` (SHOULD)
**Status:** N/A — source maps used instead of debug symbols
**Action:** Mark N/A on badge.
**Deliverable:** Badge page answer

### 23. `build_non_recursive` (MUST)
**Status:** Turborepo resolves build graph
**Action:** Badge page answer — reference `turbo.json` task pipeline.
**Deliverable:** Badge page answer only

### 24. `build_repeatable` (MUST)
**Status:** Frozen lockfile, pinned deps — needs verification
**Action:**
1. Verify reproducibility: two clean builds, compare output hashes
2. If non-deterministic, configure tsup to strip timestamps/metadata
3. Add reproducibility verification step to CI
**Deliverable:** CI workflow update, badge page answer

### 25. `installation_common` (MUST)
**Status:** Homebrew, curl, npm, `pilot uninstall` all exist
**Action:** Badge page answer.
**Deliverable:** Badge page answer only

### 26. `installation_standard_variables` (MUST)
**Status:** N/A — npm/Homebrew handle paths
**Action:** Mark N/A on badge.
**Deliverable:** Badge page answer

### 27. `installation_development_quick` (MUST)
**Status:** Works but not documented
**Action:** Add "Development Setup" to `CONTRIBUTING.md` — clone, `pnpm install`, `pnpm build`, `pnpm test`.
**Deliverable:** Section in `/CONTRIBUTING.md`

### 28. `external_dependencies` (MUST)
**Status:** package.json + pnpm-lock.yaml
**Action:** Badge page answer.
**Deliverable:** Badge page answer only

### 29. `dependency_monitoring` (MUST)
**Status:** Consolidated maintenance PRs + CodeQL
**Action:** Badge page answer — reference dependency maintenance PRs and CodeQL workflow.
**Deliverable:** Badge page answer only

### 30. `updateable_reused_components` (MUST)
**Status:** npm ecosystem + consolidated maintenance PRs
**Action:** Badge page answer.
**Deliverable:** Badge page answer only

### 31. `interfaces_current` (SHOULD)
**Status:** No deprecated APIs, Biome catches deprecated patterns
**Action:** Badge page answer.
**Deliverable:** Badge page answer only

### 32. `automated_integration_testing` (MUST)
**Status:** Vitest in CI on every push/PR
**Action:** Badge page answer.
**Deliverable:** Badge page answer only

### 33. `regression_tests_added50` (MUST)
**Status:** No tracked bugs without tests in last 6 months
**Action:** Add regression test policy to test policy doc. Badge page answer.
**Deliverable:** Section in `/CONTRIBUTING.md`

### 34. `test_statement_coverage80` (MUST)
**Status:** CLI at 71%, kit at 94%
**Action:**
1. Write tests for `src/commands/` (thin wrappers — quick wins)
2. Write tests for `Modal.tsx`, `ThinkingRow.tsx`, uncovered components
3. Improve `Update.tsx` coverage (currently 48%)
4. Add coverage threshold to `vitest.config.ts`: 80% statements
5. Add coverage reporting to CI
**Deliverable:** New test files, vitest config update, CI update

### 35. `test_policy_mandated` (MUST)
**Status:** Informal (CLAUDE.md mentions TDD)
**Action:** Add formal test policy to `CONTRIBUTING.md` — new features must include tests, bug fixes must include regression tests, coverage must not decrease below 80%, enforced by CI.
**Deliverable:** Section in `/CONTRIBUTING.md`

---

## Section 5: Security

### 36. `implement_secure_design` (MUST)
**Status:** Principles followed, not documented
**Action:** Document in assurance case — least privilege (plugin permissions), fail-safe defaults (TLS, frozen lockfile), complete mediation (Zod validation), defense in depth (CI + runtime).
**Deliverable:** Section in `/docs/ASSURANCE-CASE.md`

### 37. `input_validation` (MUST)
**Status:** Zod for manifests, Commander for CLI args, fuzz testing
**Action:**
1. Audit all input surfaces for unvalidated paths
2. Add Zod validation to any gaps found
3. Document validation strategy in assurance case
**Deliverable:** Code fixes (if gaps found), section in `/docs/ASSURANCE-CASE.md`

### 38. `crypto_credential_agility` (MUST)
**Status:** API keys in env vars, not in code
**Action:** Document in assurance case — credentials stored in env vars or `~/.pilot/` config, separate from code, rotatable without recompilation.
**Deliverable:** Section in `/docs/ASSURANCE-CASE.md`

### 39. `crypto_algorithm_agility` (SHOULD)
**Status:** Delegated to Node.js TLS + Sigstore
**Action:** Document in assurance case — no custom crypto, algorithm negotiation handled by platform.
**Deliverable:** Section in `/docs/ASSURANCE-CASE.md`

### 40. `crypto_certificate_verification` (MUST)
**Status:** Node.js default behavior, no TLS bypass in codebase
**Action:** Verify with grep, then badge page answer.
**Deliverable:** Badge page answer only

### 41. `crypto_verification_private` (MUST)
**Status:** Node.js handles this
**Action:** Badge page answer.
**Deliverable:** Badge page answer only

### 42. `signed_releases` (MUST)
**Status:** npm provenance exists, binaries unsigned
**Action:**
1. Add `cosign sign-blob` step to `.github/workflows/build-binaries.yml`
2. Uses keyless signing via GitHub OIDC — `id-token: write` permission
3. Upload `.sig` and `.bundle` attestation files to GitHub Release
4. Document verification in `SECURITY.md`: `cosign verify-blob --certificate-identity --certificate-oidc-issuer`
5. npm provenance already covers npm packages
**Deliverable:** CI workflow update, section in `/SECURITY.md`

### 43. `version_tags_signed` (SUGGESTED)
**Status:** Tags not signed
**Action:** Add SSH tag signing to Changesets release workflow. Since this is only SUGGESTED, implement as low-priority.
**Deliverable:** CI workflow update

### 44. `assurance_case` (MUST)
**Status:** Does not exist
**Action:** Create `docs/ASSURANCE-CASE.md` covering 5 threat surfaces:
1. **Local machine trust** — runs as user, no privilege escalation, `~/.pilot/` scoped
2. **Plugin/skill supply chain** — manifest Zod validation, SHA-256 checksums, planned signing
3. **AI provider communication** — API keys in env vars, HTTPS-only, no prompt storage
4. **Network operations** — TLS default, installer verification, Homebrew SHA256
5. **MCP server interactions** — plugin permission model, planned safety scanning

Includes: threat model, trust boundary diagram, OWASP/CWE mapping, secure design arguments.
**Deliverable:** `/docs/ASSURANCE-CASE.md`

---

## Deliverables Summary

### New Files
| File | Criteria Covered |
|------|-----------------|
| `GOVERNANCE.md` | governance, roles_responsibilities, access_continuity, bus_factor, maintenance_or_update |
| `CODE_OF_CONDUCT.md` | code_of_conduct |
| `ROADMAP.md` | documentation_roadmap |
| `CONTRIBUTING.md` | dco, coding_standards, documentation_current, accessibility, dev_quick_start, test_policy, regression_tests |
| `docs/ARCHITECTURE.md` | documentation_architecture |
| `docs/SECURITY-EXPECTATIONS.md` | documentation_security |
| `docs/SECURITY-CREDITS.md` | vulnerability_report_credit |
| `docs/ASSURANCE-CASE.md` | implement_secure_design, input_validation, crypto_credential_agility, crypto_algorithm_agility, assurance_case |

### Modified Files
| File | Changes |
|------|---------|
| `SECURITY.md` | vulnerability response timeline, reporter credit policy, release signing verification docs |
| `README.md` | Quick Start section, Silver badge |
| `.github/workflows/build-binaries.yml` | Sigstore cosign signing |
| `.github/workflows/release.yml` | SSH tag signing (optional) |
| `vitest.config.ts` (or workspace configs) | Coverage thresholds |

### New Test Files
| Target | Current Coverage |
|--------|-----------------|
| `src/commands/*.test.ts` | 0% → target 80%+ |
| `src/components/Modal.test.tsx` | 0% → target 80%+ |
| `src/components/ThinkingRow.test.tsx` | 0% → target 80%+ |
| `src/screens/Update.test.tsx` (expand) | 48% → target 80%+ |

### Badge Page Answers Only (no code/doc changes)
`coding_standards_enforced`, `build_non_recursive`, `installation_common`, `external_dependencies`, `dependency_monitoring`, `updateable_reused_components`, `interfaces_current`, `automated_integration_testing`, `crypto_certificate_verification`, `crypto_verification_private`, `sites_password_security`, `build_standard_variables`, `build_preserve_debug`, `installation_standard_variables`, `internationalization`

---

## Implementation Order

Work criterion-by-criterion, grouped by deliverable file to minimize context switches:

1. **GOVERNANCE.md** — criteria 1-4, 16
2. **CODE_OF_CONDUCT.md** — criterion 5
3. **CONTRIBUTING.md** — criteria 6, 11, 13, 19, 27, 33, 35
4. **SECURITY.md** updates — criteria 17, 18, 42 (verification docs)
5. **docs/SECURITY-CREDITS.md** — criterion 17
6. **docs/SECURITY-EXPECTATIONS.md** — criterion 9
7. **docs/ARCHITECTURE.md** — criterion 8
8. **ROADMAP.md** — criterion 7
9. **README.md** Quick Start — criterion 10
10. **docs/ASSURANCE-CASE.md** — criteria 36-39, 44
11. **Input validation audit** — criterion 37
12. **Sigstore signing in CI** — criterion 42
13. **Tag signing in CI** — criterion 43
14. **Build reproducibility verification** — criterion 24
15. **Test coverage to 80%** — criterion 34
16. **Coverage thresholds in CI** — criterion 34
17. **Badge page answers** — all remaining criteria
