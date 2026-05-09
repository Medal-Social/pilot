# Pilot

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Medal-Social/Pilot/badge)](https://scorecard.dev/viewer/?uri=github.com/Medal-Social/Pilot)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12447/badge)](https://www.bestpractices.dev/projects/12447)
[![codecov](https://codecov.io/gh/Medal-Social/Pilot/graph/badge.svg)](https://codecov.io/gh/Medal-Social/Pilot)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Your AI crew, ready to fly.**

Pilot is an open source, local-first AI CLI platform. The repo combines a React Ink terminal app, a plugin system, AI routing, machine setup tooling, and a GitHub-based release pipeline in one TypeScript monorepo.

Everything runs locally by default. Network services are used for publishing, distribution, security scanning, and optional product features, but the core CLI and local configuration stay on your machine.

## Technical Entry Points

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - monorepo structure, request flow, plugin lifecycle, build pipeline
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) - CI, release, deploy, and agentic automation inventory
- [CONTRIBUTING.md](CONTRIBUTING.md) - contributor rules, testing policy, release discipline
- [SECURITY.md](SECURITY.md) - vulnerability reporting and release verification
- [docs/SECURITY-EXPECTATIONS.md](docs/SECURITY-EXPECTATIONS.md) - concrete security posture and non-goals

## What Ships Today

- `packages/cli` contains the main `@medalsocial/pilot` terminal application
- `packages/plugins/kit` contains the bundled machine-management plugin
- GitHub Actions handles CI, package releases, binary builds, security scans, and the landing-page worker deploy
- `workers/pilot-landing` serves `pilot.medalsocial.com` and the install script
- Changesets drives package versioning and changelog generation

## How Pilot Is Built

| Layer | Technology | Why |
|-------|------------|-----|
| Terminal UI | React Ink | React mental model for terminal screens and reusable UI primitives |
| Command routing | Commander.js | Stable CLI parsing and help generation |
| AI layer | Vercel AI SDK | Streaming, tool calling, provider abstraction |
| Plugins | `plugin.toml` + Zod validation | Declarative commands, MCP servers, and permission checks |
| Package build | TypeScript + tsup | Package compilation and local developer builds |
| Binary distribution | `bun build --compile` | Standalone executables attached to GitHub releases |
| Testing | Vitest + ink-testing-library + E2E | Component, command, repo-guardrail, and end-to-end coverage |
| Linting | Biome | Fast formatting and static checks |
| Versioning | Changesets | Controlled multi-package release flow |
| CI/CD | GitHub Actions | Quality gates, package publishing, security scans, deploys |
| Machine setup | Nix (abstracted in product UX) | Reproducible machine configuration without surfacing Nix to end users |

## Monorepo Map

```text
pilot/
├── packages/
│   ├── cli/              # @medalsocial/pilot
│   └── plugins/
│       └── kit/          # @medalsocial/kit
├── workers/pilot-landing/ # Landing page + install script worker
├── tests/                # Repo-level and e2e tests
├── docs/                 # Architecture, workflows, security, and quality records
├── scripts/              # Build and install helpers
└── .github/workflows/    # CI, release, deploy, and agentic automations
```

For the full codebase walkthrough, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Release And Automation Flow

Pilot uses two workflow families:

1. Deterministic GitHub Actions YAML workflows for CI, npm publishing, binary attachment, worker deploys, and security scans.
2. `gh-aw` agentic workflows written in Markdown and compiled to `.lock.yml` files for planning, PR triage, issue triage, changeset generation, and related automations.

The important operational detail is that package publishing and binary attachment are separate workflows:

- `release.yml` publishes the npm package and creates the GitHub release/tag.
- `build-binaries.yml` runs after the release is published, compiles per-platform binaries, signs them, uploads the assets, and syncs the Homebrew tap.

That means a GitHub Release can exist before binary assets appear, and if the binary workflow fails the release can remain package-only until the workflow is rerun. The repo-level workflow inventory lives in [docs/WORKFLOWS.md](docs/WORKFLOWS.md).

## Local-First Model

- **Knowledge base** lives under `~/.pilot/`
- **Crew config** is portable via `AGENTS.md` and `CLAUDE.md`
- **Telemetry** is local-only
- **Plugin permissions** are declared in `plugin.toml` and validated before load

Cloud connectivity remains optional. The CLI, local state, and configuration model do not depend on a hosted Pilot backend.

## Quick Start

```bash
# Install
curl -fsSL pilot.medalsocial.com/install | sh

# Launch
pilot
```

## Commands

| Command | What it does |
|---------|--------------|
| `pilot` | Launch the cockpit and chat with the crew |
| `pilot up <template>` | Install a template, skills, and related setup steps |
| `pilot crew` | Manage crew members, skills, and tools |
| `pilot training` | Manage knowledge and brand context |
| `pilot plugins` | Browse and manage plugins |
| `pilot update` | Check for and apply updates |
| `pilot status` | Show machine and system health |
| `pilot status --json` | Emit machine-readable health data |
| `pilot usage` | AI token usage and costs for this project |
| `pilot usage --week` / `--month` / `--since YYYYMMDD` | Usage by time window |
| `pilot usage --json` | Machine-readable JSON output |
| `pilot completions <shell>` | Generate shell completions |
| `pilot help` | Show command help |

### `status --json`

Outputs machine-readable JSON for scripting and CI:

```json
{
  "pilot": "0.1.5",
  "node": "v24.0.0",
  "platform": "darwin",
  "arch": "arm64"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pilot` | `string` | Installed Pilot version |
| `node` | `string` | Node.js version with `v` prefix |
| `platform` | `string` | OS platform (`darwin`, `linux`, `win32`) |
| `arch` | `string` | CPU architecture (`arm64`, `x64`) |

### Shell Completions

```bash
# Bash
pilot completions bash >> ~/.bashrc

# Zsh
pilot completions zsh >> ~/.zshrc

# Fish
pilot completions fish > ~/.config/fish/completions/pilot.fish
```

## Contributor Quick Start

```bash
pnpm install
pnpm build
pnpm quality
pnpm quality:100
pnpm test
pnpm dev
```

Contributor guardrails:

- Use `pnpm` only; other package managers are blocked
- Run `pnpm quality:100` before opening quality, workflow, package, or plugin changes
- Add a changeset for release-worthy changes unless the PR is explicitly internal-only
- Do not commit generated `dist/` or `coverage/` output
- Review AI-assisted patches before merging and add tests for behavior changes

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor policy.

## Operational References

Long-form design history and implementation plans are maintained outside this source repository. Use the following files as the current operational reference:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)

---

## Feature Tracker

Status: **Pre-release** · Building v1

### Core Platform
| Feature | Status | Spec |
|---------|--------|------|
| Monorepo + toolchain (Turbo, Biome, Husky) | Done | [Plan](docs/plans/masterplan.md) |
| React Ink component library | Done | [Plan](docs/plans/masterplan.md) |
| Commander.js CLI routing | Done | [Plan](docs/plans/masterplan.md) |
| Design token system (from Pencil) | Done | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Structured logging + error system | Planned | [Plan](docs/plans/masterplan.md) |
| ErrorBoundary + crash recovery | Planned | [Plan](docs/plans/masterplan.md) |

### Onboarding & Setup
| Feature | Status | Spec |
|---------|--------|------|
| curl installer (single command) | Planned | [Plan](docs/plans/masterplan.md) |
| Welcome screen + crew introduction | Done | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Home screen (instruments dashboard) | Done | [Plan](docs/plans/02-screens.md) |
| REPL routing (Welcome → Home) | Done | [Plan](docs/plans/02-screens.md) |
| Machine detection + auto-config | Done | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Update flow (check, progress, what's new) | Done | [Plan](docs/plans/02-screens.md) |
| XDG Base Directory compliance | Planned | [Plan](docs/plans/masterplan.md) |

### AI & Crew
| Feature | Status | Spec |
|---------|--------|------|
| Vercel AI SDK integration (Claude) | Planned | [Plan](docs/plans/masterplan.md) |
| 5 crew leads (Brand, Marketing, Tech, CS, Sales) | Planned | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Auto-routing (natural language to right crew lead) | Planned | [Plan](docs/plans/masterplan.md) |
| AI retry + timeout + offline resilience | Planned | [Plan](docs/plans/masterplan.md) |
| AGENTS.md / CLAUDE.md generation | Planned | [Plan](docs/plans/masterplan.md) |

### Skill Deployment
| Feature | Status | Spec |
|---------|--------|------|
| ~/.pilot/skills/ structure | Planned | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Symlink to ~/.claude/skills/pilot | Planned | [Plan](docs/plans/masterplan.md) |
| CLAUDE.md routing injection | Planned | [Plan](docs/plans/masterplan.md) |
| Smart updates (manifest checksums) | Planned | [Plan](docs/plans/masterplan.md) |
| Tech Lead dev guide + AI best practices | Planned | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |

### Plugin System
| Feature | Status | Spec |
|---------|--------|------|
| Plugin manifest (plugin.toml + Zod) | Done | [Plan](docs/plans/masterplan.md) |
| Plugin registry (load, enable, disable, remove) | Done | [Plan](docs/plans/masterplan.md) |
| Plugins screen (split panel browse + manage) | Done | [Plan](docs/plans/02-screens.md) |
| Plugin sandboxing (permission enforcement) | Planned | [Plan](docs/plans/masterplan.md) |
| Contribution guidelines | Planned | [Plan](docs/plans/masterplan.md) |

### Training & Knowledge
| Feature | Status | Spec |
|---------|--------|------|
| Training screen (split panel sources) | Done | [Plan](docs/plans/02-screens.md) |
| Knowledge base (sources, articles, runs) | Planned | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Bi-directional source sync | Planned | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Config migration system | Planned | [Plan](docs/plans/masterplan.md) |

### Admin
| Feature | Status | Spec | Description |
|---------|--------|------|-------------|
| Admin Dashboard | In Progress | [Spec](docs/superpowers/specs/2026-04-19-admin-dashboard-design.md) | CLI command center with health strip, tabbed panels, SDK-powered data |

### Machine Management (Kit)
| Feature | Status | Spec |
|---------|--------|------|
| `pilot kit init` — bootstrap a fresh machine | Done | [Spec](docs/superpowers/specs/2026-04-20-kit-machine-package-v1-design.md) |
| `pilot kit status` — health checks (TTY + JSON) | Done | [Spec](docs/superpowers/specs/2026-04-20-kit-machine-package-v1-design.md) |
| `pilot kit update` — pull + rebuild with progress UI | Done | [Spec](docs/superpowers/specs/2026-04-20-kit-machine-package-v1-design.md) |
| `pilot kit clean` — scan and remove junk/dev caches | Done | [Spec](docs/superpowers/specs/2026-04-22-kit-clean-design.md) |
| Kit readiness — `KIT_CONFIG`, completions guardrail, JSON error envelope | Done | Spec — Vault `vault/open-source/pilot/specs/2026-05-09-pilot-kit-readiness-design.md` |

### pilot up (One-Click Setup)
| Feature | Status | Spec |
|---------|--------|------|
| Hosted registry (fetch, cache, SHA verify, offline fallback) | Done | [Spec](docs/superpowers/specs/2026-04-21-pilot-up-registry-design.md) |
| Template manifest format (pkg/npm/mcp/skill steps, cross-platform) | Done | [Spec](docs/superpowers/specs/2026-04-21-pilot-up-registry-design.md) |
| `pilot up <template>` install flow with progress UI | Done | [Spec](docs/superpowers/specs/2026-04-21-pilot-up-registry-design.md) |
| `pilot up` browse UI (split-panel, categories) | Done | [Spec](docs/superpowers/specs/2026-04-21-pilot-up-registry-design.md) |
| `pilot down <template>` step-based uninstall | Done | [Spec](docs/superpowers/specs/2026-04-21-pilot-up-registry-design.md) |
| Specialist crew wiring on install | Done | [Spec](docs/superpowers/specs/2026-04-21-pilot-up-registry-design.md) |

### Observability
| Feature | Status | Spec |
|---------|--------|------|
| `pilot usage` — Claude Code + Codex token/cost report | Done | [Spec](docs/superpowers/specs/2026-04-22-pilot-usage-design.md) |

### MedalSocial SDK Integration
| Feature | Status | Spec |
|---------|--------|------|
| SDK mainstreaming design | Planned | [Spec](docs/superpowers/specs/2026-04-21-medalsocial-sdk-mainstreaming-design.md) |
| PR1: Release pipeline | Planned | [Plan](docs/superpowers/plans/2026-04-21-medalsocial-sdk-pr1-release-pipeline.md) |
| PR2: Pilot integration | Planned | [Plan](docs/superpowers/plans/2026-04-21-medalsocial-sdk-pr2-pilot-integration.md) |

### Distribution & Quality
| Feature | Status | Spec |
|---------|--------|------|
| tsup dual CJS/ESM build | Planned | [Plan](docs/plans/masterplan.md) |
| Single binary via ncc | Planned | [Plan](docs/plans/masterplan.md) |
| Changesets versioning + automation classifier | Done | [Plan](docs/plans/masterplan.md) |
| GitHub Actions CI + release | Done | [Plan](docs/plans/masterplan.md) |
| E2E test suite | Planned | [Plan](docs/plans/masterplan.md) |
| Shell completions (bash, zsh, fish) + parity guardrail | Done | Spec — Vault `vault/open-source/pilot/specs/2026-05-09-pilot-kit-readiness-design.md` |
| NO_COLOR / FORCE_COLOR support | Done | [Plan](docs/plans/masterplan.md) |
| Local-only telemetry | Planned | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |
| Themes (dark/light from design tokens) | Planned | [Spec](docs/specs/2026-04-09-pilot-cli-v2-design.md) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor workflow, testing rules, and review policy.

## License

Apache-2.0
