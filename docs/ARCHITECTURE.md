# Architecture

## Overview

Pilot is a TypeScript monorepo that produces a CLI tool and plugin packages. The CLI uses React Ink for terminal UI, Commander.js for command routing, and the Vercel AI SDK for AI interactions.

## Monorepo Structure

```
pilot/
├── packages/
│   ├── cli/                  # @medalsocial/pilot — the main CLI
│   │   ├── src/
│   │   │   ├── bin/          # Entry point (pilot.ts — Commander setup)
│   │   │   ├── commands/     # Command handlers (one file per command)
│   │   │   ├── screens/      # React Ink screen components (full-page views)
│   │   │   ├── components/   # Reusable React Ink UI components
│   │   │   ├── plugins/      # Plugin manifest parsing, registry, loader
│   │   │   ├── crew/         # AI crew member definitions and routing
│   │   │   ├── device/       # Machine state, templates, backup/restore
│   │   │   ├── deploy/       # Skill deployment to ~/.pilot/skills/
│   │   │   ├── update/       # Update checking logic
│   │   │   ├── training/     # Knowledge base types
│   │   │   ├── hooks/        # React hooks (useListNav, etc.)
│   │   │   ├── colors.ts     # Design token system (light/dark themes)
│   │   │   ├── settings.ts   # User settings persistence
│   │   │   ├── errors.ts     # PilotError + error codes
│   │   │   └── version.ts    # Package version export
│   │   └── dist/             # Built output (tsup)
│   └── plugins/
│       └── kit/              # @medalsocial/kit — machine management
├── workers/
│   └── pilot-landing/        # Cloudflare Worker landing/install surface
├── tests/                    # Repo-level guardrail tests
├── scripts/                  # Build, install, release scripts
├── docs/                     # Specs, plans, security docs
├── .github/workflows/        # CI/CD pipelines
├── biome.json                # Linter/formatter config
├── turbo.json                # Turborepo task graph
└── pnpm-workspace.yaml       # Workspace definitions
```

Current quality-sensitive package paths are `packages/cli`, `packages/plugins/kit`, and
`workers/pilot-landing`.

## Request Flow

```
User types command
        │
        ▼
   bin/pilot.ts (Commander.js)
        │
        ▼
   commands/*.ts (thin handlers)
        │
        ▼
   screens/*.tsx (React Ink full-page views)
        │
        ▼
   components/*.tsx (reusable UI primitives)
```

1. **Entry point** (`bin/pilot.ts`): Commander.js parses CLI arguments and routes to command handlers
2. **Commands** (`commands/*.ts`): Thin functions that call `render()` with the appropriate screen component. Some commands (like `down`) handle logic directly.
3. **Screens** (`screens/*.tsx`): Full-page React Ink components that compose UI primitives and manage state
4. **Components** (`components/*.tsx`): Reusable UI building blocks — SplitPanel, TabBar, Step, Modal, StatusBar, Header, ProgressBar, ThinkingRow

## Plugin System

```
plugin.toml → Zod validation → PluginRegistry
                                    │
                          ┌─────────┼─────────┐
                          ▼         ▼         ▼
                      commands  mcpServers  permissions
```

- Plugins are declared via `plugin.toml` manifests validated by Zod schemas
- The `PluginRegistry` manages lifecycle: load, enable, disable, remove
- Plugins can provide commands, MCP servers, and require permissions (e.g., network access)
- Plugin discovery scans `~/.pilot/plugins/` for installed plugins

## AI Layer

- Uses Vercel AI SDK with `@ai-sdk/anthropic` (Claude) as the default provider
- Crew members are defined in `crew/members.ts` with roles, skills, and routing rules
- The root agent auto-routes user requests to the appropriate crew lead (Brand, Marketing, Tech, CS, Sales)

## Build Pipeline

- **Development:** `tsup` compiles TypeScript to dual CJS/ESM
- **Production binary:** `bun build --compile` produces standalone executables per platform
- **CI:** Turborepo orchestrates build → test → lint across all packages
- **Release:** Changesets manages versioning, GitHub Actions publishes to npm (with provenance) and GitHub Releases (with Sigstore signing)

## Design Token System

Colors are defined in `colors.ts` and sourced from Pencil design files (`05-cli.pen`). The token system supports light and dark terminal themes. All components use tokens — no hardcoded hex values.
