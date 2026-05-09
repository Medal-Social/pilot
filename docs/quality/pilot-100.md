# Pilot 100 Quality Ledger

**Last updated:** 2026-05-07
**Scope:** `Medal-Social/Pilot` only.
**Rule:** every shipped source path is tested, deleted, or justified.

## Status Keys

| Status | Meaning |
|---|---|
| `open` | Finding is real and still needs implementation work. |
| `fixed` | Finding was resolved by a code, test, docs, or workflow change. |
| `accepted-exclusion` | Finding is intentionally kept with a reason, verification, and sunset. |
| `removed` | Finding disappeared because the surface was deleted. |

## Findings

| ID | Surface | Finding | Decision | Status | Verification | Sunset |
|---|---|---|---|---|---|---|
| P100-001 | docs | `docs/ARCHITECTURE.md` and `CONTRIBUTING.md` list plugin packages that are not present in the current workspace. | Update docs to match actual `packages/cli`, `packages/plugins/kit`, and `workers/pilot-landing` layout. | fixed | `node scripts/pilot-100.mjs` docs check | Fixed in PR |
| P100-002 | docs | `docs/WORKFLOWS.md` describes `main` CI triggers while current CI targets `dev` and `prod`. | Update workflow docs to describe current branch targets. | fixed | `node scripts/pilot-100.mjs` docs check | Fixed in PR |
| P100-003 | worker | `workers/pilot-landing` is outside `pnpm-workspace.yaml`; root quality commands did not naturally include it. | Add `pnpm quality:worker` to install worker dependencies, typecheck the worker, and run a Wrangler dry-run build inside `quality:100`. | fixed | `pnpm quality:worker` | Fixed in PR |
| P100-004 | quality gate | Existing checks are strong but split across `quality`, `knip`, `secret:scan`, shellcheck, coverage, and Codecov. | Add `pnpm quality:100` as a single local and CI gate. | fixed | `pnpm quality:100` | Fixed in PR |
| P100-005 | verifier | Generic tools do not validate Pilot-specific plugin/package/docs contracts. | Add and test `scripts/pilot-100.mjs`. | fixed | `pnpm test:repo -- tests/pilot-100.test.ts` | Fixed in PR |
| P100-006 | tests | `packages/cli/src/usage/format.test.ts` assumed TTY color output even when the caller environment sets `NO_COLOR=1`. | Clear and restore `NO_COLOR` inside the TTY-color test setup. | fixed | `pnpm --dir packages/cli test src/usage/format.test.ts -- --run` | Fixed in PR |
| P100-007 | knip | `pnpm knip:check` still reports warning-level unused exports/types and one unlisted dependency because `knip.config.ts` currently sets those rules to `warn`. | Keep warning mode in this PR and use the ledger as the ratchet point for a follow-up deletion pass. | accepted-exclusion | `pnpm quality:100` prints the warning inventory while still exiting cleanly. | 2026-06-07 |
| P100-008 | coverage | CLI and kit plugin coverage did not meet the Pilot 100 target across statements, functions, and lines. | Add behavioral edge-case tests, remove a redundant migration guard, target 100% coverage, enforce a 97% hard floor for statements/functions/lines, and include repo guardrail coverage in `quality:100`. | fixed | `pnpm quality:100` runs repo coverage and reports 100% statements/functions/lines for CLI and kit. | Fixed in PR |
