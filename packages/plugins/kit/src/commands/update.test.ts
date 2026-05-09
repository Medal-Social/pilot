// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalProvider } from '../provider/local.js';
import { runMigrations, runUpdate } from './update.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'upd-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runUpdate', () => {
  it('pulls then rebuilds in order', async () => {
    const calls: string[] = [];
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        calls.push([cmd, ...args].slice(0, 4).join(' '));
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    await runUpdate({
      machine: 'ali-pro',
      machineType: 'darwin',
      kitRepoDir: dir,
      provider: new LocalProvider(),
      exec,
      sudoKeeper: { start: () => () => undefined },
    });
    const pullPos = calls.findIndex((c) => c.startsWith('git -C') && c.includes('pull'));
    const rebuildPos = calls.findIndex((c) => c.startsWith('sudo') && c.includes('darwin-rebuild'));
    expect(pullPos).toBeGreaterThan(-1);
    expect(rebuildPos).toBeGreaterThan(pullPos);
  });

  it('runs migrations against machines/ subdirectories', async () => {
    mkdirSync(join(dir, 'machines', 'personal'), { recursive: true });
    writeFileSync(
      join(dir, 'machines', 'personal', 'demo.nix'),
      `{ ... }: {
  homebrew.casks = [
    "zed"
  ];
  homebrew.brews = [
    "jq"
  ];
}
`
    );
    const changed = await runMigrations(dir);
    expect(changed).toBe(1);
    const apps = JSON.parse(
      readFileSync(join(dir, 'machines', 'personal', 'demo.apps.json'), 'utf8')
    );
    expect(apps.casks).toEqual(['zed']);
  });

  it('returns zero migrations when machines directory is missing', async () => {
    await expect(runMigrations(dir)).resolves.toBe(0);
  });

  it('skips unreadable machine entries while scanning migrations', async () => {
    mkdirSync(join(dir, 'machines'), { recursive: true });
    symlinkSync(join(dir, 'missing.nix'), join(dir, 'machines', 'dangling.nix'));

    await expect(runMigrations(dir)).resolves.toBe(0);
  });

  it('starts and stops the sudo keeper', async () => {
    const stop = vi.fn();
    const start = vi.fn().mockReturnValue(stop);
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await runUpdate({
      machine: 'ali-pro',
      machineType: 'darwin',
      kitRepoDir: dir,
      provider: new LocalProvider(),
      exec,
      sudoKeeper: { start },
    });
    expect(start).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('stops the sudo keeper when SIGINT is received during rebuild', async () => {
    const stop = vi.fn();
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'sudo' && args.includes('darwin-rebuild')) {
          process.emit('SIGINT');
        }
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    await runUpdate({
      machine: 'ali-pro',
      machineType: 'darwin',
      kitRepoDir: dir,
      provider: new LocalProvider(),
      exec,
      sudoKeeper: { start: () => stop },
    });

    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('emits phase details for pull, policy, migration, and rebuild', async () => {
    mkdirSync(join(dir, 'machines'), { recursive: true });
    writeFileSync(
      join(dir, 'machines', 'ali-pro.nix'),
      `{ ... }: {
  homebrew.casks = [
    "zed"
  ];
}
`
    );
    const details: string[] = [];
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('rev-list'))
          return { stdout: '2\n', stderr: '', code: 0 };
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const provider = {
      id: 'test',
      displayName: 'Test',
      getRequiredApps: vi.fn().mockResolvedValue({
        casks: [{ name: 'zed', reason: 'policy' }],
        brews: [{ name: 'ripgrep', reason: 'policy' }],
        source: 'fleet',
      }),
      getRequiredPlugins: vi.fn(),
      getSecurityBaseline: vi.fn(),
      reportStatus: vi.fn(),
    };

    await runUpdate({
      machine: 'ali-pro',
      machineType: 'darwin',
      kitRepoDir: dir,
      provider,
      exec,
      sudoKeeper: { start: () => () => undefined },
      user: 'ali',
      hooks: {
        onPhaseEnd(_phase, _label, detail) {
          if (detail) details.push(detail);
        },
      },
    });

    expect(details).toEqual(
      expect.arrayContaining([
        'sudo cached',
        'pulled 2 commit(s)',
        '2 required (source: fleet)',
        '1 machine file(s) updated',
      ])
    );
    expect(details).toContainEqual(expect.stringMatching(/^applied in \d+s$/));
    expect(provider.getRequiredApps).toHaveBeenCalledWith(
      expect.objectContaining({ machineId: 'ali-pro', user: 'ali', kitRepoDir: dir })
    );
  });

  it('throws when sudo authentication fails', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'denied', code: 1 }),
      spawn: vi.fn(),
    };

    await expect(
      runUpdate({
        machine: 'ali-pro',
        machineType: 'darwin',
        kitRepoDir: dir,
        provider: new LocalProvider(),
        exec,
        sudoKeeper: { start: () => () => undefined },
      })
    ).rejects.toMatchObject({ code: 'KIT_SUDO_DENIED' });
  });

  it('throws when git pull fails', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'git' && args.includes('pull'))
          return { stdout: '', stderr: 'not fast-forward', code: 1 };
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    await expect(
      runUpdate({
        machine: 'ali-pro',
        machineType: 'darwin',
        kitRepoDir: dir,
        provider: new LocalProvider(),
        exec,
        sudoKeeper: { start: () => () => undefined },
      })
    ).rejects.toMatchObject({
      code: 'KIT_REPO_PULL_FAILED',
      cause: 'not fast-forward',
    });
  });
});
