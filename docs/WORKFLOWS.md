# Workflows And Automations

This document is the repo-level map of Pilot's delivery and automation layer.

Use it to answer three questions quickly:

1. Which workflow owns a given part of delivery?
2. Which files are the source of truth?
3. Which automations are deterministic versus agentic?

For current run health, use the GitHub Actions UI. This document explains the intended behavior and ownership of each workflow, not the live status of the last run.

## Workflow Families

Pilot uses two workflow families:

- **Deterministic workflows**: hand-authored `.yml` files that run fixed build, test, release, deploy, and security steps.
- **Agentic workflows**: `gh-aw` Markdown workflows compiled into `.lock.yml` files. The Markdown file is the editable source; the `.lock.yml` file is the runnable artifact.

## Source Of Truth

- Edit deterministic workflows directly in `.github/workflows/*.yml`.
- Edit agentic workflows in `.github/workflows/*.md`.
- Recompile agentic workflows with `gh aw compile` after changing a Markdown workflow source.
- Do not hand-edit `.github/workflows/*.lock.yml` unless you are debugging generation output and know exactly why.

## Deterministic Workflows

### CI

- **File**: `.github/workflows/ci.yml`
- **Triggers**: `push` and `pull_request` on `main`
- **Purpose**: repo quality gate
- **Jobs**:
  - `test`: installs dependencies, runs `pnpm quality`, then runs coverage-enabled tests and uploads coverage to Codecov
  - `lint`: runs `pnpm lint`
  - `security`: runs `pnpm secret:scan` and `pnpm knip:check`
  - `shellcheck`: validates `scripts/install.sh`

### Release

- **File**: `.github/workflows/release.yml`
- **Triggers**: `push` on `main`, `workflow_dispatch`
- **Purpose**: publish the npm package and create/update release PRs via Changesets
- **Behavior**:
  - checks out with a GitHub App token
  - runs `pnpm install --frozen-lockfile`
  - runs `pnpm quality`
  - invokes `changesets/action`
  - publishes with npm provenance enabled

### Build Binaries

- **File**: `.github/workflows/build-binaries.yml`
- **Triggers**: GitHub `release.published`
- **Purpose**: attach standalone binaries to published `@medalsocial/pilot@...` releases
- **Behavior**:
  - builds per-platform binaries with `bun build --compile`
  - smoke-tests the executables
  - signs them with Sigstore `cosign`
  - uploads artifacts to the GitHub Release
  - emits SLSA provenance
  - updates the `Medal-Social/homebrew-pilot` tap after upload

**Important**: this workflow runs after a package release already exists. A GitHub Release may therefore exist without binary assets while this workflow is still running, or permanently if it fails.

### Deploy Worker

- **File**: `.github/workflows/deploy-worker.yml`
- **Triggers**: `push` to `main` when `workers/pilot-landing/**` changes
- **Purpose**: deploy the landing page and install-script worker to Cloudflare
- **Behavior**:
  - installs dependencies in `workers/pilot-landing`
  - runs `wrangler deploy`

### CodeQL

- **File**: `.github/workflows/codeql.yml`
- **Triggers**: `push`, `pull_request` on `main`, and weekly schedule
- **Purpose**: static security analysis for JavaScript/TypeScript

### Scorecard

- **File**: `.github/workflows/scorecard.yml`
- **Triggers**: `push` on `main` and weekly schedule
- **Purpose**: OpenSSF Scorecard analysis published to code scanning

### Auto Approve

- **File**: `.github/workflows/auto-approve.yml`
- **Triggers**: `pull_request_target` on `main`
- **Purpose**: approve trusted bot PRs and enable auto-merge for release bot PRs
- **Allowed actors**:
  - `medal-social-release-bot[bot]`

## Agentic Workflows

Agentic workflows are written as Markdown prompts and compiled into runnable lock files. They are powerful, but also the part of the automation stack most likely to drift if the prompt is not customized for Pilot's actual repo layout.

### Agentic Maintenance

- **File**: `.github/workflows/agentics-maintenance.yml`
- **Purpose**: maintain `gh-aw` generated workflows, safe outputs, labels, and validation tasks

### Changeset Generator

- **Source**: `.github/workflows/changeset.md`
- **Compiled**: `.github/workflows/changeset.lock.yml`
- **Purpose**: generate and push changeset files on PRs when the PR looks release-worthy

### Plan Command

- **Source**: `.github/workflows/plan.md`
- **Compiled**: `.github/workflows/plan.lock.yml`
- **Purpose**: respond to `/plan` comments in issues or discussions by creating grouped implementation issues

### PR Triage Agent

- **Source**: `.github/workflows/pr-triage-agent.md`
- **Compiled**: `.github/workflows/pr-triage-agent.lock.yml`
- **Purpose**: scheduled PR categorization, risk scoring, and reporting

### Auto-Triage Issues

- **Source**: `.github/workflows/auto-triage-issues.md`
- **Compiled**: `.github/workflows/auto-triage-issues.lock.yml`
- **Purpose**: issue labeling and discussion reporting for unlabeled issues

### Breaking Change Checker

- **Source**: `.github/workflows/breaking-change-checker.md`
- **Compiled**: `.github/workflows/breaking-change-checker.lock.yml`
- **Purpose**: scheduled breaking-change review and issue creation

### Test Quality Sentinel

- **Source**: `.github/workflows/test-quality-sentinel.md`
- **Compiled**: `.github/workflows/test-quality-sentinel.lock.yml`
- **Purpose**: PR test-review automation beyond simple coverage percentages

### Daily Workflow Updater

- **Source**: `.github/workflows/daily-workflow-updater.md`
- **Compiled**: `.github/workflows/daily-workflow-updater.lock.yml`
- **Purpose**: update GitHub Actions pins and open automation PRs

## Shared Agentic Components

Reusable prompt fragments live under `.github/workflows/shared/`.

Current shared files include:

- `activation-app.md`
- `changeset-format.md`
- `github-guard-policy.md`
- `jqschema.md`
- `observability-otlp.md`
- `python-dataviz.md`
- `reporting.md`

These are imported into Markdown workflows during compilation.

## Operational Notes

### Editing Agentic Workflows Safely

- Start with the `.md` file, not the `.lock.yml`
- Keep prompts specific to Pilot's actual file layout and stack
- Re-run `gh aw compile` after edits
- Review the generated lock file and Git diff before merging

### Release Semantics

- npm publication is owned by `release.yml`
- binary attachment is owned by `build-binaries.yml`
- Homebrew sync happens only after the binary upload phase
- Cloudflare worker deploy is independent of package release cadence

### Documentation Boundaries

- `README.md` should explain the current technical shape of the repo
- this file should explain which workflow owns which automation path
- `docs/ARCHITECTURE.md` should explain the code structure and runtime flow
- historical plans/specs should not be treated as the live operations manual
