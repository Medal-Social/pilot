# Governance

## Decision-Making Model

Pilot uses a **Benevolent Dictator** governance model. The Project Lead makes final decisions on roadmap, releases, and technical direction. Decisions are discussed openly in GitHub Issues and Pull Requests before being made.

Medal Social (the organization) owns the GitHub repository and npm packages, providing institutional continuity independent of any individual contributor.

## Roles and Responsibilities

### Project Lead

- Sets the project roadmap and priorities
- Reviews and merges pull requests
- Manages releases and versioning (via Changesets)
- Triages and responds to security reports (see [SECURITY.md](SECURITY.md))
- Maintains CI/CD pipelines and infrastructure

### Contributor

- Opens issues for bugs, features, and questions
- Submits pull requests following [CONTRIBUTING.md](CONTRIBUTING.md)
- Participates in design discussions on GitHub Issues
- Reports security vulnerabilities via the process in [SECURITY.md](SECURITY.md)

### Organization Admin (Medal Social)

- Manages GitHub organization membership and repository access
- Manages npm organization and package publishing permissions
- Appoints or replaces the Project Lead if needed
- Ensures project continuity if the current lead is unavailable

## Access Continuity

The Medal Social organization owns all project infrastructure:

- **GitHub:** Repository is under the `Medal-Social` organization. Org admins can grant write access to any member.
- **npm:** The `@medalsocial` scope is owned by the organization. Org admins can grant publish permissions.
- **Homebrew:** The `homebrew-pilot` tap is under the `Medal-Social` organization.
- **Domain:** `pilot.medalsocial.com` is managed by Medal Social.

If the Project Lead becomes unavailable, organization admins can appoint a successor and grant them all necessary access within hours. No credentials are held exclusively by a single person.

## Bus Factor

The project currently has one active maintainer. This is mitigated by:

- Organization ownership of all infrastructure (see above)
- All project knowledge is in the repository (specs, plans, CLAUDE.md)
- CI/CD is fully automated — releases require no manual steps beyond merging
- No proprietary tooling or credentials that only one person can access

## Maintenance Policy

Pilot maintains a **single active release line**. There are no long-term support branches.

- Security fixes and bug fixes ship in the next release
- Users upgrade to the latest version via `pilot update` or `brew upgrade pilot`
- Breaking changes follow semver and are documented in the changelog (via Changesets)
- Dependencies are reviewed through consolidated maintenance PRs
