// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repoStep } from './repo.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'repo-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('repoStep', () => {
  it('check true when .git exists in repoDir', async () => {
    mkdirSync(join(dir, '.git'));
    expect(
      await repoStep.check({ exec: { run: vi.fn(), spawn: vi.fn() }, env: { KIT_REPO_DIR: dir } })
    ).toBe(true);
  });

  it('check false when .git missing', async () => {
    expect(
      await repoStep.check({ exec: { run: vi.fn(), spawn: vi.fn() }, env: { KIT_REPO_DIR: dir } })
    ).toBe(false);
  });

  it('check false without a step context', async () => {
    expect(await repoStep.check()).toBe(false);
  });

  it('check throws when KIT_REPO_DIR is missing', async () => {
    await expect(
      repoStep.check({ exec: { run: vi.fn(), spawn: vi.fn() }, env: {} })
    ).rejects.toMatchObject({ code: 'KIT_CONFIG_NOT_FOUND' });
  });

  it('run clones when .git missing', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await repoStep.run({
      exec,
      env: { KIT_REPO_DIR: dir, KIT_REPO_URL: 'git@github.com:Medal-Social/kit.git' },
    });
    const [cmd, args] =
      exec.run.mock.calls.find((c: (string | string[])[]) => c[0] === 'git') ?? [];
    expect(cmd).toBe('git');
    expect(args[0]).toBe('clone');
  });

  it('run pulls when .git exists', async () => {
    mkdirSync(join(dir, '.git'));
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await repoStep.run({ exec, env: { KIT_REPO_DIR: dir, KIT_REPO_URL: 'x' } });
    const [cmd, args] =
      exec.run.mock.calls.find((c: (string | string[])[]) => c[0] === 'git') ?? [];
    expect(cmd).toBe('git');
    expect(args).toEqual(expect.arrayContaining(['pull']));
  });

  it('run throws when KIT_REPO_DIR is missing', async () => {
    await expect(
      repoStep.run({ exec: { run: vi.fn(), spawn: vi.fn() }, env: {} })
    ).rejects.toMatchObject({ code: 'KIT_CONFIG_NOT_FOUND' });
  });

  it('run throws when KIT_REPO_URL is missing for a clone', async () => {
    await expect(
      repoStep.run({ exec: { run: vi.fn(), spawn: vi.fn() }, env: { KIT_REPO_DIR: dir } })
    ).rejects.toMatchObject({ code: 'KIT_CONFIG_NOT_FOUND' });
  });

  it('run throws when pulling an existing repo fails', async () => {
    mkdirSync(join(dir, '.git'));
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'pull failed', code: 1 }),
      spawn: vi.fn(),
    };

    await expect(repoStep.run({ exec, env: { KIT_REPO_DIR: dir } })).rejects.toMatchObject({
      code: 'KIT_REPO_PULL_FAILED',
      cause: 'pull failed',
    });
  });

  it('run throws when cloning fails', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd === 'git') return { stdout: '', stderr: 'clone failed', code: 1 };
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    await expect(
      repoStep.run({
        exec,
        env: {
          KIT_REPO_DIR: join(dir, 'clone'),
          KIT_REPO_URL: 'git@github.com:Medal-Social/kit.git',
        },
      })
    ).rejects.toMatchObject({
      code: 'KIT_REPO_CLONE_FAILED',
      cause: 'clone failed',
    });
  });
});
