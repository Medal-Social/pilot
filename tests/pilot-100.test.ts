import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkDocsDrift,
  checkLedger,
  checkPackageMetadata,
  checkPluginManifests,
  checkWorkflowGate,
  formatFinding,
  runPilot100,
} from '../scripts/pilot-100.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('../scripts/pilot-100.mjs', import.meta.url));
const roots: string[] = [];

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pilot-100-'));
  roots.push(root);

  await mkdir(join(root, 'packages/cli'), { recursive: true });
  await mkdir(join(root, 'packages/plugins/kit'), { recursive: true });
  await mkdir(join(root, 'workers/pilot-landing'), { recursive: true });
  await mkdir(join(root, 'docs/quality'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, '.github/workflows'), { recursive: true });

  await writeFile(
    rootFile(root, 'pnpm-workspace.yaml'),
    'packages:\n  - "packages/*"\n  - "packages/plugins/*"\n'
  );
  await writeJson(rootFile(root, 'package.json'), {
    scripts: {
      'quality:100':
        'pnpm quality && pnpm test:repo:coverage && pnpm quality:worker && pnpm test -- --run --coverage && pnpm knip:check && pnpm secret:scan && pnpm pilot-100',
    },
  });
  await writeJson(rootFile(root, 'packages/cli/package.json'), {
    name: '@medalsocial/pilot',
    type: 'module',
    exports: { '.': './dist/index.js', './package.json': './package.json' },
    files: ['dist', 'README.md', 'LICENSE'],
    scripts: { test: 'vitest', typecheck: 'tsc --noEmit -p tsconfig.json' },
  });
  await writeJson(rootFile(root, 'packages/plugins/kit/package.json'), {
    name: '@medalsocial/kit',
    type: 'module',
    main: 'dist/index.js',
    exports: { '.': './dist/index.js', './package.json': './package.json' },
    files: ['dist', 'plugin.toml', 'README.md', 'LICENSE'],
    scripts: { test: 'vitest', typecheck: 'tsc --noEmit -p tsconfig.json' },
  });
  await writeFile(
    rootFile(root, 'packages/plugins/kit/plugin.toml'),
    'name = "kit"\nnamespace = "medalsocial"\ndescription = "Machine config"\n'
  );
  await writeFile(
    rootFile(root, 'README.md'),
    'packages/cli\npackages/plugins/kit\nworkers/pilot-landing\nquality:100\n'
  );
  await writeFile(
    rootFile(root, 'CONTRIBUTING.md'),
    'packages/cli\npackages/plugins/kit\nworkers/pilot-landing\nquality:100\n'
  );
  await writeFile(
    rootFile(root, 'docs/ARCHITECTURE.md'),
    'packages/cli\npackages/plugins/kit\nworkers/pilot-landing\n'
  );
  await writeFile(rootFile(root, 'docs/WORKFLOWS.md'), 'dev\nprod\nPilot 100\n');
  await writeFile(
    rootFile(root, 'docs/quality/pilot-100.md'),
    [
      '# Pilot 100 Quality Ledger',
      '',
      '## Findings',
      '',
      '| ID | Surface | Finding | Decision | Status | Verification | Sunset |',
      '|---|---|---|---|---|---|---|',
      '| P100-001 | docs | Docs drift. | Update docs. | fixed | node scripts/pilot-100.mjs | Before PR merge |',
      '| P100-003 | worker | Worker outside workspace. | Keep explicit. | accepted-exclusion | documented skip | 2026-06-07 |',
      '',
    ].join('\n')
  );
  await writeFile(
    rootFile(root, '.github/workflows/ci.yml'),
    'jobs:\n  pilot-100:\n    steps:\n      - run: pnpm quality:100\n'
  );
  await writeFile(
    rootFile(root, '.github/workflows/release.yml'),
    'jobs:\n  release:\n    steps:\n      - run: pnpm quality:100\n'
  );

  return root;
}

function rootFile(root: string, path: string): string {
  return join(root, path);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('checkLedger', () => {
  it('accepts fixed and justified rows with verification and sunset', async () => {
    const root = await fixtureRepo();

    expect(await checkLedger(root)).toEqual([]);
  });

  it('requires the ledger file to exist', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, 'docs/quality/pilot-100.md'));

    expect(await checkLedger(root)).toContainEqual(
      expect.objectContaining({ code: 'ledger-missing' })
    );
  });

  it('requires a findings table in the ledger', async () => {
    const root = await fixtureRepo();
    await writeFile(rootFile(root, 'docs/quality/pilot-100.md'), '# Pilot 100 Quality Ledger\n');

    expect(await checkLedger(root)).toContainEqual(
      expect.objectContaining({ code: 'ledger-empty' })
    );
  });

  it('ignores non-findings tables in the ledger', async () => {
    const root = await fixtureRepo();
    const ledger = rootFile(root, 'docs/quality/pilot-100.md');
    const text = await readFile(ledger, 'utf8');
    await writeFile(
      ledger,
      [
        '# Pilot 100 Quality Ledger',
        '',
        '## Status Keys',
        '',
        '| Status | Meaning |',
        '|---|---|',
        '| `open` | Finding is real. |',
        '',
        text,
      ].join('\n')
    );

    expect(await checkLedger(root)).toEqual([]);
  });

  it('rejects accepted exclusions without a sunset', async () => {
    const root = await fixtureRepo();
    const ledger = rootFile(root, 'docs/quality/pilot-100.md');
    const text = await readFile(ledger, 'utf8');
    await writeFile(ledger, text.replace('2026-06-07', ' '));

    expect(await checkLedger(root)).toContainEqual(
      expect.objectContaining({ code: 'ledger-accepted-exclusion-incomplete' })
    );
  });

  it('rejects rows without verification', async () => {
    const root = await fixtureRepo();
    const ledger = rootFile(root, 'docs/quality/pilot-100.md');
    const text = await readFile(ledger, 'utf8');
    await writeFile(ledger, text.replace('node scripts/pilot-100.mjs', ' '));

    expect(await checkLedger(root)).toContainEqual(
      expect.objectContaining({ code: 'ledger-verification-missing' })
    );
  });

  it('rejects unknown statuses', async () => {
    const root = await fixtureRepo();
    const ledger = rootFile(root, 'docs/quality/pilot-100.md');
    const text = await readFile(ledger, 'utf8');
    await writeFile(ledger, text.replace('| fixed |', '| pending |'));

    expect(await checkLedger(root)).toContainEqual(
      expect.objectContaining({ code: 'ledger-invalid-status' })
    );
  });

  it('rejects open findings', async () => {
    const root = await fixtureRepo();
    const ledger = rootFile(root, 'docs/quality/pilot-100.md');
    const text = await readFile(ledger, 'utf8');
    await writeFile(ledger, text.replace('| fixed |', '| open |'));

    expect(await checkLedger(root)).toContainEqual(
      expect.objectContaining({ code: 'ledger-open-finding' })
    );
  });
});

describe('checkPluginManifests', () => {
  it('allows repos without plugin packages', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, 'packages/plugins'), { recursive: true, force: true });

    expect(await checkPluginManifests(root)).toEqual([]);
  });

  it('ignores non-package entries under packages/plugins', async () => {
    const root = await fixtureRepo();
    await writeFile(rootFile(root, 'packages/plugins/README.md'), 'notes\n');
    await mkdir(rootFile(root, 'packages/plugins/local'), { recursive: true });

    expect(await checkPluginManifests(root)).toEqual([]);
  });

  it('requires every plugin package to ship plugin.toml', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, 'packages/plugins/kit/plugin.toml'));

    expect(await checkPluginManifests(root)).toContainEqual(
      expect.objectContaining({ code: 'plugin-manifest-missing' })
    );
  });
});

describe('checkPackageMetadata', () => {
  it('requires quality:100 at the root', async () => {
    const root = await fixtureRepo();
    await writeJson(rootFile(root, 'package.json'), { scripts: {} });

    expect(await checkPackageMetadata(root)).toContainEqual(
      expect.objectContaining({ code: 'package-root-quality-missing' })
    );
  });

  it('requires quality:100 to run the full quality chain', async () => {
    const root = await fixtureRepo();
    await writeJson(rootFile(root, 'package.json'), {
      scripts: { 'quality:100': 'pnpm quality && pnpm test:repo:coverage' },
    });

    expect(await checkPackageMetadata(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'package-root-quality-command-missing',
          message: expect.stringContaining('pnpm test -- --run --coverage'),
        }),
        expect.objectContaining({
          code: 'package-root-quality-command-missing',
          message: expect.stringContaining('pnpm quality:worker'),
        }),
        expect.objectContaining({
          code: 'package-root-quality-command-missing',
          message: expect.stringContaining('pnpm knip:check'),
        }),
        expect.objectContaining({
          code: 'package-root-quality-command-missing',
          message: expect.stringContaining('pnpm secret:scan'),
        }),
        expect.objectContaining({
          code: 'package-root-quality-command-missing',
          message: expect.stringContaining('pnpm pilot-100'),
        }),
      ])
    );
  });

  it('matches quality:100 commands exactly', async () => {
    const root = await fixtureRepo();
    await writeJson(rootFile(root, 'package.json'), {
      scripts: {
        'quality:100':
          'pnpm quality:worker && pnpm test:repo:coverage && pnpm test -- --run --coverage && pnpm knip:check && pnpm secret:scan && pnpm pilot-100',
      },
    });

    expect(await checkPackageMetadata(root)).toContainEqual(
      expect.objectContaining({
        code: 'package-root-quality-command-missing',
        message: expect.stringContaining('pnpm quality'),
      })
    );
  });

  it('requires package tests and exported package entrypoints', async () => {
    const root = await fixtureRepo();
    await writeJson(rootFile(root, 'packages/cli/package.json'), {
      name: '@medalsocial/pilot',
      files: [],
      scripts: {},
    });

    expect(await checkPackageMetadata(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'package-test-missing' }),
        expect.objectContaining({ code: 'package-typecheck-missing' }),
        expect.objectContaining({ code: 'package-exports-missing' }),
        expect.objectContaining({ code: 'package-files-missing' }),
      ])
    );
  });

  it('requires package files to exist and include names', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, 'packages/plugins/kit/package.json'));
    await writeJson(rootFile(root, 'packages/cli/package.json'), {
      scripts: { test: 'vitest', typecheck: 'tsc --noEmit -p tsconfig.json' },
      exports: { '.': './dist/index.js' },
      files: ['dist'],
    });

    expect(await checkPackageMetadata(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'package-missing' }),
        expect.objectContaining({ code: 'package-name-missing' }),
      ])
    );
  });
});

describe('checkDocsDrift', () => {
  it('flags stale package claims in docs', async () => {
    const root = await fixtureRepo();
    await writeFile(rootFile(root, 'docs/ARCHITECTURE.md'), 'packages/plugins/sanity\n');

    expect(await checkDocsDrift(root)).toContainEqual(
      expect.objectContaining({ code: 'docs-stale-package-claim' })
    );
  });

  it('requires core quality docs to mention quality:100', async () => {
    const root = await fixtureRepo();
    await writeFile(rootFile(root, 'README.md'), 'packages/cli\npackages/plugins/kit\n');

    expect(await checkDocsDrift(root)).toContainEqual(
      expect.objectContaining({ code: 'docs-quality-command-missing' })
    );
  });

  it('allows optional docs to be absent', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, 'README.md'));
    await rm(rootFile(root, 'CONTRIBUTING.md'));
    await rm(rootFile(root, 'docs/ARCHITECTURE.md'));
    await rm(rootFile(root, 'docs/WORKFLOWS.md'));

    expect(await checkDocsDrift(root)).toEqual([]);
  });

  it('requires workflow docs to mention dev/prod and Pilot 100', async () => {
    const root = await fixtureRepo();
    await writeFile(rootFile(root, 'docs/WORKFLOWS.md'), 'main\n');

    expect(await checkDocsDrift(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'docs-workflow-branches-missing' }),
        expect.objectContaining({ code: 'docs-workflow-quality-missing' }),
      ])
    );
  });

  it('requires documented layout targets to exist', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, 'workers/pilot-landing'), { recursive: true, force: true });

    expect(await checkDocsDrift(root)).toContainEqual(
      expect.objectContaining({ code: 'docs-layout-target-missing' })
    );
  });
});

describe('checkWorkflowGate', () => {
  it('requires workflow files to exist', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, '.github/workflows/ci.yml'));

    expect(await checkWorkflowGate(root)).toContainEqual(
      expect.objectContaining({ code: 'workflow-missing' })
    );
  });

  it('accepts quoted quality:100 workflow commands', async () => {
    const root = await fixtureRepo();
    await writeFile(
      rootFile(root, '.github/workflows/ci.yml'),
      'jobs:\n  pilot-100:\n    steps:\n      - run: "pnpm quality:100"\n'
    );

    expect(await checkWorkflowGate(root)).toEqual([]);
  });

  it('requires CI and release workflows to run quality:100', async () => {
    const root = await fixtureRepo();
    await writeFile(rootFile(root, '.github/workflows/release.yml'), 'jobs: {}\n');

    expect(await checkWorkflowGate(root)).toContainEqual(
      expect.objectContaining({ code: 'workflow-quality-gate-missing' })
    );
  });

  it('ignores commented quality:100 workflow commands', async () => {
    const root = await fixtureRepo();
    await writeFile(
      rootFile(root, '.github/workflows/ci.yml'),
      'jobs:\n  pilot-100:\n    steps:\n      # - run: pnpm quality:100\n'
    );

    expect(await checkWorkflowGate(root)).toContainEqual(
      expect.objectContaining({ code: 'workflow-quality-gate-missing' })
    );
  });
});

describe('formatFinding', () => {
  it('formats relative, absolute, and file-less findings', () => {
    const root = '/tmp/pilot';

    expect(formatFinding(root, { code: 'x', message: 'bad', file: 'package.json' })).toBe(
      '[x] package.json: bad'
    );
    expect(formatFinding(root, { code: 'x', message: 'bad', file: '/tmp/pilot/docs/a.md' })).toBe(
      '[x] docs/a.md: bad'
    );
    expect(formatFinding(root, { code: 'x', message: 'bad' })).toBe('[x] bad');
  });
});

describe('runPilot100', () => {
  it('returns all findings across checks', async () => {
    const root = await fixtureRepo();
    await rm(rootFile(root, 'packages/plugins/kit/plugin.toml'));

    const findings = await runPilot100(root);

    expect(findings).toContainEqual(expect.objectContaining({ code: 'plugin-manifest-missing' }));
  });

  it('executes the CLI verifier when Node receives a relative script path', async () => {
    const root = await fixtureRepo();
    await mkdir(rootFile(root, 'scripts'), { recursive: true });
    await copyFile(scriptPath, rootFile(root, 'scripts/pilot-100.mjs'));
    await rm(rootFile(root, 'packages/plugins/kit/plugin.toml'));

    await expect(
      execFileAsync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          "process.argv[1] = 'scripts/pilot-100.mjs'; await import('./scripts/pilot-100.mjs');",
        ],
        { cwd: root }
      )
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('[plugin-manifest-missing]'),
    });
  });
});
