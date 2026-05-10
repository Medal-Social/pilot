// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveKitContext } from './kit-context.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-ctx-'));
  execSync('git init -q -b main && git config user.email t@t && git config user.name t', {
    cwd: dir,
  });
  writeFileSync(
    join(dir, 'kit.config.json'),
    JSON.stringify({
      name: 'kit',
      repo: 'git@github.com:Medal-Social/Vault.git',
      gitStrategy: 'none',
      machines: { m1: { type: 'darwin', user: 'u' } },
    })
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveKitContext', () => {
  it('reads config + returns ctx for the current machine', async () => {
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'm1',
    });
    expect(ctx.kitRepoDir).toBe(dir);
    expect(ctx.user).toBe('u');
    expect(ctx.machineType).toBe('darwin');
    expect(typeof ctx.runRebuild).toBe('function');
    expect(typeof ctx.addCask).toBe('function');
    expect(typeof ctx.removeCask).toBe('function');
    expect(typeof ctx.commitAndPush).toBe('function');
  });

  it('throws when machineId is not in the config', async () => {
    await expect(
      resolveKitContext({ kitConfigPath: join(dir, 'kit.config.json'), machineId: 'unknown' })
    ).rejects.toThrow(/machine.*not.*config/i);
  });

  it('throws when the kit config file is missing', async () => {
    rmSync(join(dir, 'kit.config.json'));
    await expect(
      resolveKitContext({ kitConfigPath: join(dir, 'kit.config.json'), machineId: 'm1' })
    ).rejects.toThrow(/kit.config.json/);
  });
});
