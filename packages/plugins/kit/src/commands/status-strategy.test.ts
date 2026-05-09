// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalProvider } from '../provider/local.js';
import { renderStatus } from './status.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-strat-'));
  writeFileSync(join(dir, 'ali-pro.apps.json'), JSON.stringify({ casks: [], brews: [] }));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const okExec = () => ({
  run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
  spawn: vi.fn(),
});

describe('renderStatus — gitStrategy=none', () => {
  it('drops the four git rows when .git is absent (no warnings)', async () => {
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      gitStrategy: 'none',
      provider: new LocalProvider(),
      exec: okExec(),
    });
    const ids = report.checks.map((c) => c.id);
    expect(ids).not.toContain('repo-clean');
    expect(ids).not.toContain('remote');
    expect(ids).not.toContain('sync');
    const repoDir = report.checks.find((c) => c.id === 'repo-dir');
    expect(repoDir?.status).toBe('ok');
  });

  it('warns when gitStrategy=none but .git exists at kitRepoDir', async () => {
    mkdirSync(join(dir, '.git'));
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      gitStrategy: 'none',
      provider: new LocalProvider(),
      exec: okExec(),
    });
    const repoDir = report.checks.find((c) => c.id === 'repo-dir');
    expect(repoDir?.status).toBe('warn');
    expect(repoDir?.hint).toMatch(/gitStrategy=none.*\.git.*is present/i);
  });

  it('does not push a tool-git check when gitStrategy=none and git is missing', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, _args: string[]) => {
        if (cmd === 'git') return { stdout: '', stderr: 'command not found', code: 127 };
        return { stdout: '1.0', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      gitStrategy: 'none',
      provider: new LocalProvider(),
      exec,
    });
    const ids = report.checks.map((c) => c.id);
    expect(ids).not.toContain('tool-git');
    expect(ids).toContain('tool-nix');
    expect(ids).toContain('tool-gh');
    expect(ids).toContain('tool-sudo');
  });
});

describe('renderStatus — gitStrategy=self with parent toplevel', () => {
  it('warns with parent-repo hint when .git is missing but parent toplevel resolves', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('--show-toplevel')) {
          return { stdout: '/parent/repo\n', stderr: '', code: 0 };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      gitStrategy: 'self',
      provider: new LocalProvider(),
      exec,
    });
    const repoDir = report.checks.find((c) => c.id === 'repo-dir');
    expect(repoDir?.status).toBe('warn');
    expect(repoDir?.hint).toMatch(/parent git repo.*\/parent\/repo/i);
    expect(repoDir?.hint).toMatch(/gitStrategy.*none/);
  });
});
