import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

describe('repo guardrails', () => {
  it('defines release and quality scripts at the root', () => {
    const pkg = readJson<{ scripts?: Record<string, string>; engines?: { node?: string } }>(
      'package.json'
    );

    expect(pkg.scripts).toMatchObject({
      preinstall: 'npx only-allow pnpm',
      typecheck: 'turbo typecheck',
      quality: 'pnpm lint && pnpm typecheck && pnpm test:repo && pnpm test',
      changeset: 'changeset',
      version: 'changeset version',
      release: 'pnpm build && changeset publish',
      'knip:report': 'knip --reporter json --no-exit-code',
      'knip:check': 'knip',
    });
    expect(pkg.scripts?.['secret:lint']).toContain('secretlint');
    expect(pkg.scripts?.['secret:lint-staged']).toContain('secretlint');
    expect(pkg.engines?.node).toBe('>=24.0.0 <25');
  });

  it('uses contributor hooks for lint-staged, commitlint, tests, and secret scanning', () => {
    expect(read('.husky/pre-commit')).toContain('pnpm lint-staged');
    expect(read('.husky/pre-commit')).toContain('pnpm secret:lint-staged');
    expect(read('.husky/commit-msg')).toContain('commitlint');
    expect(read('.husky/pre-push')).toContain('pnpm lint');
    expect(read('.husky/pre-push')).toContain('pnpm typecheck');
    expect(read('.husky/pre-push')).toContain('pnpm test:repo');
    expect(read('.husky/pre-push')).toContain('pnpm test -- --run');
  });

  it('configures CI for changesets, secret scanning, and knip', () => {
    expect(read('.github/workflows/ci.yml')).toContain('pnpm quality');
    expect(read('.github/workflows/ci.yml')).toContain('pnpm secret:lint');
    expect(read('.github/workflows/ci.yml')).toContain('pnpm knip:check');
    expect(read('.github/workflows/release.yml')).toContain('changesets/action');
    expect(read('.github/workflows/release.yml')).toContain('pnpm release');
  });

  it('locks down publish surfaces for shipped packages', () => {
    const cliPkg = readJson<{
      exports?: Record<string, unknown>;
      files?: string[];
      publishConfig?: { access?: string; provenance?: boolean };
    }>('packages/cli/package.json');
    const kitPkg = readJson<{
      private?: boolean;
      exports?: Record<string, unknown>;
      files?: string[];
    }>('packages/plugins/kit/package.json');

    // CLI is the only published package
    expect(cliPkg.exports).toBeDefined();
    expect(cliPkg.files).toEqual(
      expect.arrayContaining(['dist', 'README.md', 'LICENSE', '!dist/**/*.test.*'])
    );

    // kit is an internal plugin — must not be published
    expect(kitPkg.private).toBe(true);
    expect(kitPkg.exports).toEqual({
      '.': './dist/index.js',
      './package.json': './package.json',
    });
    expect(kitPkg.files).toEqual(
      expect.arrayContaining(['dist', 'plugin.toml', 'README.md', 'LICENSE', '!dist/**/*.test.*'])
    );
  });
});
