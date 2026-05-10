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

  it('throws CONNECT_KIT_MACHINE_NOT_IN_CONFIG when machineId is not in the config', async () => {
    const { errorCodes } = await import('../errors.js');
    const promise = resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'unknown',
    });
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_KIT_MACHINE_NOT_IN_CONFIG,
    });
  });

  it('throws CONNECT_KIT_CONFIG_NOT_FOUND when the kit config file is missing', async () => {
    const { errorCodes } = await import('../errors.js');
    rmSync(join(dir, 'kit.config.json'));
    const promise = resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'm1',
    });
    await expect(promise).rejects.toMatchObject({ code: errorCodes.CONNECT_KIT_CONFIG_NOT_FOUND });
  });
});

describe('resolveKitContext.commitAndPush', () => {
  // Fake exec that records spawned argv and returns success by default.
  function fakeExec() {
    const calls: { cmd: string; args: readonly string[] }[] = [];
    return {
      calls,
      run: async (cmd: string, args: readonly string[]) => {
        calls.push({ cmd, args: Array.from(args) });
        return { code: 0, stdout: '', stderr: '' };
      },
    };
  }

  beforeEach(() => {
    // Re-init the kit.config.json with a non-skip git strategy so the
    // commit-and-push branch executes.
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'git@github.com:Medal-Social/Vault.git',
        machines: { m1: { type: 'darwin', user: 'u' } },
      })
    );
  });

  it('passes --literal-pathspecs to git add so :(...) magic is disabled (Codex P1 sweep)', async () => {
    const exec = fakeExec();
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'm1',
      exec,
    });
    await ctx.commitAndPush('msg', ['modules/configuration.nix']);
    const addCall = exec.calls.find((c) => c.cmd === 'git' && c.args[0] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall?.args).toContain('--literal-pathspecs');
    expect(addCall?.args).toContain('modules/configuration.nix');
  });

  it('skips add/commit/push entirely when paths is an explicit empty list (Codex P2 sweep — empty patch)', async () => {
    const exec = fakeExec();
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'm1',
      exec,
    });
    await ctx.commitAndPush('msg', []);
    expect(exec.calls.length).toBe(0);
  });

  it('falls back to staging the apps file when paths is undefined (legacy cask flow)', async () => {
    const exec = fakeExec();
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'm1',
      exec,
    });
    await ctx.commitAndPush('msg');
    const addCall = exec.calls.find((c) => c.cmd === 'git' && c.args[0] === 'add');
    expect(addCall).toBeDefined();
    // The legacy fallback resolves to machines/m1.apps.json or apps/apps.json.
    const lastArg = addCall?.args[addCall.args.length - 1] ?? '';
    expect(lastArg.endsWith('.apps.json')).toBe(true);
  });
});
