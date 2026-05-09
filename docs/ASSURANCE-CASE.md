# Assurance Case

This document provides a security assurance case for Pilot, justifying why the project's security requirements are met. It covers the threat model, trust boundaries, secure design principles, and how common weaknesses are addressed.

## Threat Model

### Trust Boundaries

```
┌─────────────────────────────────────────────┐
│                User's Machine               │
│  ┌───────────────────────────────────────┐  │
│  │           Pilot CLI Process           │  │
│  │  ┌─────────┐  ┌──────────────────┐   │  │
│  │  │ Commands │  │ Plugin Registry  │   │  │
│  │  │ Screens  │  │ (Zod-validated)  │   │  │
│  │  │ AI Layer │  │                  │   │  │
│  │  └─────────┘  └──────────────────┘   │  │
│  └──────────────────┬────────────────────┘  │
│                     │                       │
│  ┌──────────────────▼────────────────────┐  │
│  │         ~/.pilot/ (local data)        │  │
│  │  settings, plugins, skills, knowledge │  │
│  └───────────────────────────────────────┘  │
└─────────────────────┬───────────────────────┘
                      │ HTTPS (TLS 1.2+)
        ┌─────────────┼─────────────────┐
        ▼             ▼                 ▼
   ┌─────────┐  ┌──────────┐  ┌──────────────┐
   │ AI API  │  │ npm/GitHub│  │  MCP Servers  │
   │(Claude) │  │ Registry │  │  (plugins)    │
   └─────────┘  └──────────┘  └──────────────┘
```

### Threat Surfaces

#### 1. Local Machine Trust

**Threat:** Pilot runs with user permissions and could be used to access/modify files beyond `~/.pilot/`.

**Mitigations:**
- Pilot only reads/writes within `~/.pilot/` for its own data
- No privilege escalation — runs as the invoking user, never requests sudo
- File operations use explicit paths, never user-controlled path concatenation
- Template installation (`pilot up`) writes to well-known directories only

**Residual risk:** A compromised Pilot binary could access anything the user can. Mitigated by signed releases and provenance attestation.

#### 2. Plugin/Skill Supply Chain

**Threat:** Malicious plugins or skills could run arbitrary code.

**Mitigations:**
- Plugin manifests are validated with Zod schemas — malformed `plugin.toml` files are rejected
- Manifest parser is fuzz-tested with fast-check (1000+ randomized inputs)
- Plugin IDs are computed deterministically from validated data
- SHA-256 checksums in `manifest.json` detect tampered files during updates
- Planned: content signing, script safety scanning, runtime sandboxing, tracked in the external design history

**CWE coverage:**
- CWE-20 (Improper Input Validation): Zod schemas reject invalid manifests
- CWE-502 (Deserialization of Untrusted Data): TOML parsed with smol-toml, then validated by Zod — no dynamic code execution or unsafe deserialization of untrusted data

#### 3. AI Provider Communication

**Threat:** API keys could be leaked; sensitive prompts could be intercepted.

**Mitigations:**
- API keys are stored in environment variables, never in source code or config files committed to git
- All AI provider communication uses HTTPS (TLS certificate verification is Node.js default)
- Prompts are sent directly to the provider API — Pilot does not store, log, or relay prompts
- Users can rotate API keys at any time without recompilation or reinstallation

**CWE coverage:**
- CWE-798 (Hard-coded Credentials): Credentials stored in env vars, not code
- CWE-319 (Cleartext Transmission): All API calls use HTTPS

#### 4. Network Operations

**Threat:** Man-in-the-middle attacks during install, update, or dependency resolution.

**Mitigations:**
- TLS certificate verification is enabled by default (Node.js). There are no TLS bypass flags in the codebase.
- The curl installer downloads from `pilot.medalsocial.com` over HTTPS
- Homebrew formula includes SHA-256 hashes for every binary
- npm packages are published with provenance attestation
- Binary releases are signed with Sigstore cosign
- Dependencies are locked (`pnpm-lock.yaml`) and installed with `--frozen-lockfile` in CI

**CWE coverage:**
- CWE-295 (Improper Certificate Validation): Node.js default TLS verification, no bypass
- CWE-494 (Download of Code Without Integrity Check): SHA-256 hashes, npm provenance, Sigstore signatures

#### 5. MCP Server Interactions

**Threat:** AI tools could invoke MCP servers that perform destructive actions.

**Mitigations:**
- Plugins declare MCP servers in their manifest; only declared servers are loaded
- Plugin permissions are declared in `plugin.toml` and enforced — network access requires explicit `permissions.network` declaration
- Planned: safety scanning blocks dangerous patterns (destructive shell commands, piped downloads, dynamic code execution)

**CWE coverage:**
- CWE-862 (Missing Authorization): Plugin permission model requires explicit capability declaration

## Secure Design Principles

Pilot implements the following secure design principles from the [Saltzer & Schroeder](https://web.mit.edu/Saltzer/www/publications/protection/) framework:

| Principle | Implementation |
|-----------|---------------|
| **Fail-safe defaults** | TLS verification on, frozen lockfile in CI, plugins disabled by default until enabled |
| **Complete mediation** | All plugin manifests validated by Zod before loading; CLI arguments parsed by Commander.js |
| **Least privilege** | CLI runs as user, plugins declare required permissions, no sudo |
| **Economy of mechanism** | Minimal dependencies (6 production deps), simple data flow (Commander → Screen → Component) |
| **Open design** | Open source, security policy public, no security through obscurity |
| **Separation of privilege** | CODEOWNERS requires review for security-sensitive paths (.github/, deploy/, skills/) |

## Input Validation Strategy

All inputs from potentially untrusted sources are validated:

| Input Surface | Validation Method |
|---------------|-------------------|
| CLI arguments | Commander.js argument parsing with type constraints |
| `plugin.toml` manifests | Zod schema with `safeParse()` — rejects invalid structures |
| TOML files | `smol-toml` parser (safe, no dynamic execution) → Zod validation |
| User text input (REPL) | Ink `TextInput` component — passed to AI provider as-is (provider handles prompt safety) |
| Update check responses | Version string comparison only, no code execution |

Fuzz testing with fast-check (1000+ iterations) ensures the manifest parser never throws on arbitrary input.

## Cryptographic Practices

### Credential Agility

Credentials are stored separately from application code:

- **AI API keys:** Environment variables (`ANTHROPIC_API_KEY`, etc.)
- **GitHub tokens:** GitHub Actions secrets, never in source
- **npm tokens:** GitHub Actions environment (`npm` environment), with `id-token: write` for provenance

Users can rotate any credential without recompilation. No credentials are compiled into binaries.

### Algorithm Agility

Pilot does not implement custom cryptographic algorithms. All cryptography is delegated to:

- **Node.js TLS stack:** Handles HTTPS connections with automatic algorithm negotiation
- **Sigstore cosign:** Handles release signing with keyless OIDC-based signatures
- **npm provenance:** Uses Sigstore under the hood for package attestation

If any algorithm is compromised, updating the Node.js runtime or Sigstore tooling is sufficient — no Pilot code changes required.
