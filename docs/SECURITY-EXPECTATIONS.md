# Security Expectations

What you can and cannot expect from Pilot's security posture.

## What Pilot Does

- **Local-first:** All data is stored on your machine at `~/.pilot/`. Nothing is transmitted unless you explicitly connect a cloud service.
- **No telemetry:** Analytics are local-only (`~/.pilot/analytics/`). No data is sent to Medal Social or any third party.
- **TLS by default:** All network communication (npm registry, GitHub API, AI providers) uses HTTPS. Node.js performs certificate verification by default. There are no TLS bypass flags in the codebase.
- **Plugin permissions:** Plugins declare permissions in `plugin.toml`. Network access must be explicitly declared. Plugin manifests are validated with Zod schemas.
- **Credential separation:** API keys and tokens are stored in environment variables or `~/.pilot/` config files, never embedded in application code. You can rotate credentials without reinstalling.
- **Dependency security:** Dependencies are reviewed through consolidated maintenance PRs and CodeQL. The lockfile (`pnpm-lock.yaml`) is frozen in CI for reproducible builds.
- **Signed releases:** npm packages include provenance attestation. Binary releases are signed with Sigstore.
- **Input validation:** Plugin manifests, TOML configs, and CLI arguments are validated before processing. The manifest parser is fuzz-tested with property-based testing (fast-check).

## What Pilot Does Not Do

- **Sandbox plugins at runtime.** Plugins run with your user permissions. A malicious plugin could access your filesystem. Only install plugins you trust. (Runtime sandboxing is planned.)
- **Encrypt local data.** Files in `~/.pilot/` are stored as plain text. Protect them with your OS file permissions.
- **Audit AI responses.** Pilot sends your prompts to the configured AI provider (default: Anthropic Claude). The AI provider's privacy policy governs how prompts are handled.
- **Guarantee AI output safety.** AI-generated content may be incorrect, biased, or inappropriate. Always review AI output before publishing.

## Threat Model

See [ASSURANCE-CASE.md](ASSURANCE-CASE.md) for the full threat model covering local machine trust, plugin supply chain, AI provider communication, network operations, and MCP server interactions.
