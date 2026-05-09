import { describe, expect, it } from 'vitest';

import {
  allFilesIgnored,
  classify,
  classifyCommit,
  decideCheckExit,
  mapFileToPackage,
  matchesIgnoredGlob,
  semverDiff,
  slugify,
  stripConventionalPrefix,
} from '../scripts/changeset-auto.mjs';

interface ClassifierInputs {
  pr: number;
  headSha: string;
  changedFiles: string[];
  commitSubjects: string[];
  prTitle: string;
  prAuthor: string;
  prLabels: string[];
  commentBody?: string;
  runtimeDeps?: Record<string, string>;
}

function baseInputs(overrides: Partial<ClassifierInputs> = {}): ClassifierInputs {
  return {
    pr: 55,
    headSha: 'abcdef1234567890',
    changedFiles: [],
    commitSubjects: [],
    prTitle: '',
    prAuthor: 'alioftech',
    prLabels: [],
    commentBody: undefined,
    runtimeDeps: {},
    ...overrides,
  };
}

describe('matchesIgnoredGlob', () => {
  it('matches directory prefixes with /**', () => {
    expect(matchesIgnoredGlob('docs/foo/bar.md', 'docs/**')).toBe(true);
    expect(matchesIgnoredGlob('docs', 'docs/**')).toBe(true);
    expect(matchesIgnoredGlob('packages/cli/src/index.ts', 'docs/**')).toBe(false);
  });

  it('matches root basenames only for *.md', () => {
    expect(matchesIgnoredGlob('README.md', '*.md')).toBe(true);
    expect(matchesIgnoredGlob('packages/cli/README.md', '*.md')).toBe(false);
  });

  it('matches literal filenames', () => {
    expect(matchesIgnoredGlob('biome.json', 'biome.json')).toBe(true);
    expect(matchesIgnoredGlob('packages/biome.json', 'biome.json')).toBe(false);
  });
});

describe('mapFileToPackage', () => {
  it('maps cli paths to @medalsocial/pilot', () => {
    expect(mapFileToPackage('packages/cli/src/foo.ts')).toBe('@medalsocial/pilot');
  });

  it('ignores kit paths', () => {
    expect(mapFileToPackage('packages/plugins/kit/src/foo.ts')).toBeNull();
  });

  it('ignores docs and root files', () => {
    expect(mapFileToPackage('README.md')).toBeNull();
    expect(mapFileToPackage('docs/plan.md')).toBeNull();
  });
});

describe('classifyCommit', () => {
  it('detects feat as minor', () => {
    expect(classifyCommit('feat: add new flag')).toBe('minor');
    expect(classifyCommit('feat(cli): scope')).toBe('minor');
  });

  it('detects fix as patch', () => {
    expect(classifyCommit('fix: bug')).toBe('patch');
  });

  it('detects breaking-change bang as major', () => {
    expect(classifyCommit('feat!: breaking')).toBe('major');
    expect(classifyCommit('refactor(core)!: breaking')).toBe('major');
  });

  it('detects BREAKING CHANGE footer as major', () => {
    expect(classifyCommit('BREAKING CHANGE: drop node 20')).toBe('major');
  });

  it('classifies docs/test/ci as unknown', () => {
    expect(classifyCommit('docs: update readme')).toBe('unknown');
    expect(classifyCommit('test: add coverage')).toBe('unknown');
    expect(classifyCommit('ci: bump action')).toBe('unknown');
  });

  it('returns unknown for non-conventional', () => {
    expect(classifyCommit('hello world')).toBe('unknown');
  });
});

describe('semverDiff', () => {
  it('detects patch bumps', () => {
    expect(semverDiff('1.2.3', '1.2.4')).toBe('patch');
  });

  it('detects minor bumps', () => {
    expect(semverDiff('1.2.3', '1.3.0')).toBe('minor');
  });

  it('detects major bumps', () => {
    expect(semverDiff('1.2.3', '2.0.0')).toBe('major');
  });

  it('handles v prefix', () => {
    expect(semverDiff('v1.2.3', 'v1.2.4')).toBe('patch');
  });
});

describe('slugify & stripConventionalPrefix', () => {
  it('slugifies to kebab-case', () => {
    expect(slugify('Fix the keyboard nav')).toBe('fix-the-keyboard-nav');
  });

  it('falls back to changeset when empty', () => {
    expect(slugify('!!!')).toBe('changeset');
  });

  it('strips conventional prefix from PR titles', () => {
    expect(stripConventionalPrefix('feat(cli): add X')).toBe('add X');
    expect(stripConventionalPrefix('fix!: bug')).toBe('bug');
    expect(stripConventionalPrefix('no prefix here')).toBe('no prefix here');
  });
});

describe('allFilesIgnored', () => {
  it('returns true for docs-only PRs', () => {
    expect(allFilesIgnored(['docs/a.md', 'README.md', '.github/workflows/ci.yml'])).toBe(true);
  });

  it('returns false once a code file is touched', () => {
    expect(allFilesIgnored(['docs/a.md', 'packages/cli/src/foo.ts'])).toBe(false);
  });
});

describe('classify — skip paths', () => {
  it('docs-only PR → skipped', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['docs/spec.md', 'README.md'],
        commitSubjects: ['docs: update'],
        prTitle: 'docs: update',
      })
    );
    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('ignored paths only');
    expect(result.exitCode).toBe(0);
  });

  it('tests-only PR → skipped', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['tests/foo.test.ts'],
        commitSubjects: ['test: add'],
        prTitle: 'test: add',
      })
    );
    expect(result.action).toBe('skipped');
    expect(result.exitCode).toBe(0);
  });

  it('CI-only PR → skipped', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['.github/workflows/ci.yml'],
        commitSubjects: ['ci: add job'],
        prTitle: 'ci: add job',
      })
    );
    expect(result.action).toBe('skipped');
    expect(result.exitCode).toBe(0);
  });

  it('kit-only PR → skipped (no publishable package)', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/plugins/kit/src/foo.ts'],
        commitSubjects: ['feat: kit flag'],
        prTitle: 'feat: kit flag',
      })
    );
    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('no publishable package');
    expect(result.exitCode).toBe(0);
  });

  it('mixed docs + cli code → proceeds', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['docs/a.md', 'packages/cli/src/foo.ts'],
        commitSubjects: ['fix: bug'],
        prTitle: 'fix: bug',
      })
    );
    expect(result.action).toBe('created');
    expect(result.type).toBe('patch');
    expect(result.packages).toEqual(['@medalsocial/pilot']);
  });
});

describe('classify — conventional commit inference', () => {
  it('feat: commit → minor', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['feat: add X'],
        prTitle: 'feat: add X',
      })
    );
    expect(result.type).toBe('minor');
    expect(result.action).toBe('created');
    expect(result.exitCode).toBe(1);
    expect(result.file).toMatch(/^\.changeset\/auto-55-abcdef1-/);
  });

  it('fix: commit → patch', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['fix: bug'],
        prTitle: 'fix: bug',
      })
    );
    expect(result.type).toBe('patch');
  });

  it('feat! commit → major', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['feat!: breaking'],
        prTitle: 'feat!: breaking',
      })
    );
    expect(result.type).toBe('major');
  });

  it('no conventional commits on code paths → ambiguous (exit 2)', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['WIP', 'random edit'],
        prTitle: 'random edit',
      })
    );
    expect(result.action).toBe('ambiguous');
    expect(result.exitCode).toBe(2);
  });
});

describe('classify — dependabot', () => {
  it('runtime dep bump → patch changeset', () => {
    const result = classify(
      baseInputs({
        prAuthor: 'dependabot[bot]',
        changedFiles: ['packages/cli/package.json', 'pnpm-lock.yaml'],
        commitSubjects: ['build(deps): bump commander from 12.0.0 to 12.0.1'],
        prTitle: 'build(deps): bump commander from 12.0.0 to 12.0.1',
        runtimeDeps: { commander: '12.0.0' },
      })
    );
    expect(result.action).toBe('created');
    expect(result.type).toBe('patch');
    expect(result.description).toContain('commander');
  });

  it('runtime minor bump → minor changeset', () => {
    const result = classify(
      baseInputs({
        prAuthor: 'dependabot[bot]',
        changedFiles: ['packages/cli/package.json'],
        commitSubjects: ['build(deps): bump commander from 12.0.0 to 12.1.0'],
        prTitle: 'build(deps): bump commander from 12.0.0 to 12.1.0',
        runtimeDeps: { commander: '12.0.0' },
      })
    );
    expect(result.type).toBe('minor');
  });

  it('dev-dep bump → skipped', () => {
    const result = classify(
      baseInputs({
        prAuthor: 'dependabot[bot]',
        changedFiles: ['packages/cli/package.json'],
        commitSubjects: ['build(deps-dev): bump vitest from 4.0.0 to 4.1.0'],
        prTitle: 'build(deps-dev): bump vitest from 4.0.0 to 4.1.0',
        runtimeDeps: {},
      })
    );
    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('dev-dep');
  });
});

describe('classify — labels & comments', () => {
  it('no-changeset label → skipped', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['feat: X'],
        prTitle: 'feat: X',
        prLabels: ['no-changeset'],
      })
    );
    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('no-changeset');
  });

  it('patch label overrides feat minor → patch', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['feat: X'],
        prTitle: 'feat: X',
        prLabels: ['patch'],
      })
    );
    expect(result.type).toBe('patch');
  });

  it('/skip-changeset comment → user-skip', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['feat: X'],
        commentBody: '/skip-changeset',
      })
    );
    expect(result.action).toBe('user-skip');
    expect(result.exitCode).toBe(0);
  });

  it('/changeset patch: desc → writes with exact desc', () => {
    const result = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['wip'],
        commentBody: '/changeset patch: fix keyboard nav',
      })
    );
    expect(result.action).toBe('created');
    expect(result.type).toBe('patch');
    expect(result.description).toBe('fix keyboard nav');
  });
});

describe('classify — filename stability', () => {
  it('produces the same filename on re-run with same head sha and desc', () => {
    const a = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['fix: bug'],
        prTitle: 'fix: bug',
      })
    );
    const b = classify(
      baseInputs({
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['fix: bug'],
        prTitle: 'fix: bug',
      })
    );
    expect(a.file).toBe(b.file);
  });

  it('different head sha → different filename', () => {
    const a = classify(
      baseInputs({
        headSha: 'aaaaaaa0000',
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['fix: bug'],
        prTitle: 'fix: bug',
      })
    );
    const b = classify(
      baseInputs({
        headSha: 'bbbbbbb0000',
        changedFiles: ['packages/cli/src/foo.ts'],
        commitSubjects: ['fix: bug'],
        prTitle: 'fix: bug',
      })
    );
    expect(a.file).not.toBe(b.file);
  });
});

describe('decideCheckExit', () => {
  it('passes when action is created and a changeset is already present', () => {
    expect(decideCheckExit({ action: 'created' }, true)).toEqual({ exit: 0 });
  });

  it('fails when action is created and no changeset is present', () => {
    const r = decideCheckExit({ action: 'created' }, false);
    expect(r.exit).toBe(1);
    expect(r.message).toContain('changeset is required');
  });

  it('fails when action is ambiguous and no changeset is present (regression: previously exit 0)', () => {
    const r = decideCheckExit({ action: 'ambiguous' }, false);
    expect(r.exit).toBe(1);
    expect(r.message).toContain('changeset is required');
  });

  it('passes when action is ambiguous but a changeset is already present', () => {
    expect(decideCheckExit({ action: 'ambiguous' }, true)).toEqual({ exit: 0 });
  });

  it('passes when action is skipped (no changeset needed)', () => {
    expect(decideCheckExit({ action: 'skipped' }, false)).toEqual({ exit: 0 });
  });

  it('passes when action is user-skip (explicit /skip-changeset)', () => {
    expect(decideCheckExit({ action: 'user-skip' }, false)).toEqual({ exit: 0 });
  });
});
