// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalProvider } from '../provider/local.js';
import { runInit } from './init.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'init-strat-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runInit — gitStrategy=none', () => {
  it('throws KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY before any filesystem mutation', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await expect(
      runInit({
        machine: 'ali-pro',
        machineType: 'darwin',
        kitRepoDir: dir,
        kitRepoUrl: 'git@github.com:Medal-Social/kit.git',
        gitStrategy: 'none',
        provider: new LocalProvider(),
        exec,
        platform: 'darwin',
        arch: 'arm64',
      })
    ).rejects.toMatchObject({
      name: 'KitError',
      code: 'KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY',
    });
    // Exec must not have been called at all — the guard is at the top of runInit.
    expect(exec.run).not.toHaveBeenCalled();
  });
});
