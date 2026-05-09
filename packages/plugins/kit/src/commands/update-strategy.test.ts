// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalProvider } from '../provider/local.js';
import { runUpdate } from './update.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'upd-strat-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runUpdate — gitStrategy', () => {
  it('skips git fetch/pull when gitStrategy=none and still rebuilds', async () => {
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
      gitStrategy: 'none',
      provider: new LocalProvider(),
      exec,
      sudoKeeper: { start: () => () => undefined },
    });
    const gitCalls = calls.filter((c) => c.startsWith('git -C'));
    expect(gitCalls).toEqual([]);
    const rebuilt = calls.some((c) => c.startsWith('sudo') && c.includes('darwin-rebuild'));
    expect(rebuilt).toBe(true);
  });

  it('runs git fetch/pull when gitStrategy=self (default behaviour)', async () => {
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
      gitStrategy: 'self',
      provider: new LocalProvider(),
      exec,
      sudoKeeper: { start: () => () => undefined },
    });
    expect(calls.some((c) => c.startsWith('git -C') && c.includes('pull'))).toBe(true);
  });
});
