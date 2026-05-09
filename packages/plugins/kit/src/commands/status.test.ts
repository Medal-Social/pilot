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
  dir = mkdtempSync(join(tmpdir(), 'st-'));
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, 'ali-pro.apps.json'), JSON.stringify({ casks: ['zed'], brews: [] }));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('renderStatus', () => {
  it('builds a StatusReport with apps count', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });
    expect(report.appsCount).toBe(1);
    expect(report.machineId).toBe('ali-pro');
  });

  it('records config path and matching remote when configured', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('get-url')) {
          return { stdout: 'git@github.com:Medal-Social/kit.git\n', stderr: '', code: 0 };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      configPath: join(dir, 'kit.config.json'),
      configRepoUrl: 'git@github.com:Medal-Social/kit.git',
      provider: new LocalProvider(),
      exec,
    });

    expect(report.configPath).toBe(join(dir, 'kit.config.json'));
    expect(report.remoteMatchesConfig).toBe(true);
    expect(report.checks.find((c) => c.id === 'config')?.status).toBe('ok');
    expect(report.checks.find((c) => c.id === 'remote')?.status).toBe('ok');
  });

  it('omits org policy section when LocalProvider returns empty', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });
    expect(report.orgPolicy).toBeUndefined();
  });

  it('flags missing repo dir as an error check', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 1 }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: '/nonexistent/path',
      machineFile: '/nonexistent/path/ali-pro.apps.json',
      provider: new LocalProvider(),
      exec,
    });
    const repoDirCheck = report.checks.find((c) => c.id === 'repo-dir');
    expect(repoDirCheck?.status).toBe('error');
  });

  it('warns when configured repo URL does not match git remote', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('get-url')) {
          return { stdout: 'git@github.com:other/repo.git\n', stderr: '', code: 0 };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      configRepoUrl: 'git@github.com:Medal-Social/kit.git',
      provider: new LocalProvider(),
      exec,
    });
    expect(report.remoteUrl).toBe('git@github.com:other/repo.git');
    expect(report.remoteMatchesConfig).toBe(false);
    const remoteCheck = report.checks.find((c) => c.id === 'remote');
    expect(remoteCheck?.status).toBe('warn');
  });

  it('warns when hostname is not in known machines', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'mystery-host',
      kitRepoDir: dir,
      machineFile: join(dir, 'mystery-host.apps.json'),
      knownMachines: ['ali-pro', 'ada-air'],
      provider: new LocalProvider(),
      exec,
    });
    expect(report.hostnameKnown).toBe(false);
    const machineCheck = report.checks.find((c) => c.id === 'machine');
    expect(machineCheck?.status).toBe('warn');
    expect(machineCheck?.hint).toContain('mystery-host');
  });

  it('marks hostname as known when present in known machines', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };

    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      knownMachines: ['ali-pro', 'ada-air'],
      provider: new LocalProvider(),
      exec,
    });

    expect(report.hostnameKnown).toBe(true);
    expect(report.checks.find((c) => c.id === 'machine')?.status).toBe('ok');
  });

  it('warns (not ok) when git fetch fails', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('fetch')) {
          return { stdout: '', stderr: 'fatal: unable to access remote', code: 128 };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });
    const sync = report.checks.find((c) => c.id === 'sync');
    expect(sync?.status).toBe('warn');
    expect(sync?.detail).toMatch(/fetch|could not/i);
  });

  it('warns (not ok) when rev-list fails — no upstream tracking', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('rev-list')) {
          return {
            stdout: '',
            stderr: "fatal: no upstream configured for branch 'master'",
            code: 128,
          };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });
    const sync = report.checks.find((c) => c.id === 'sync');
    expect(sync?.status).toBe('warn');
    expect(sync?.detail).toContain('upstream');
    expect(sync?.hint).toMatch(/set-upstream-to/);
  });

  it('warns when rev-list fails for a non-upstream reason', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('rev-list')) {
          return { stdout: '', stderr: 'fatal: bad revision', code: 128 };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });

    const sync = report.checks.find((c) => c.id === 'sync');
    expect(sync?.detail).toContain('could not determine sync');
    expect(sync?.hint).toContain('rev-list');
  });

  it('warns when rev-list output is not numeric', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('rev-list')) {
          return { stdout: 'later\n', stderr: '', code: 0 };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });

    const sync = report.checks.find((c) => c.id === 'sync');
    expect(sync?.detail).toContain('unparseable');
  });

  it('warns when the repo is behind upstream', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('rev-list')) {
          return { stdout: '3\n', stderr: '', code: 0 };
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });

    expect(report.commitsBehind).toBe(3);
    expect(report.checks.find((c) => c.id === 'sync')?.detail).toBe('3 commit(s) behind');
  });

  it('records tool versions when present and errors when absent', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd === 'git') return { stdout: 'git version 2.43.0\n', stderr: '', code: 0 };
        if (cmd === 'nix') return { stdout: 'nix (Nix) 2.18.0\n', stderr: '', code: 0 };
        if (cmd === 'gh') return { stdout: '', stderr: '', code: 1 }; // missing
        if (cmd === 'sudo') return { stdout: 'Sudo version 1.9.13\n', stderr: '', code: 0 };
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const report = await renderStatus({
      machine: 'ali-pro',
      kitRepoDir: dir,
      machineFile: join(dir, 'ali-pro.apps.json'),
      provider: new LocalProvider(),
      exec,
    });
    expect(report.tools.git).toContain('2.43.0');
    expect(report.tools.nix).toContain('2.18.0');
    expect(report.tools.gh).toBeNull();
    const ghCheck = report.checks.find((c) => c.id === 'tool-gh');
    expect(ghCheck?.status).toBe('error');
    expect(ghCheck?.hint).toContain('GitHub auth');
  });
});
