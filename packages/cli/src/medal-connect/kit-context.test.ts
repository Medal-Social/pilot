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

  it('routes linux runRebuild through system-manager + home-manager (not nixos-rebuild)', async () => {
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'git@github.com:example/kit.git',
        gitStrategy: 'none',
        machines: { lnx: { type: 'linux', user: 'alice' } },
      })
    );
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const exec = {
      run: async (cmd: string, args: readonly string[]) => {
        calls.push({ cmd, args: Array.from(args) });
        if (cmd === 'which' && args[0] === 'system-manager')
          return { code: 0, stdout: '/home/alice/.nix-profile/bin/system-manager\n', stderr: '' };
        if (cmd === 'which' && args[0] === 'home-manager')
          return { code: 0, stdout: '/home/alice/.nix-profile/bin/home-manager\n', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
      },
    };
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'lnx',
      exec,
    });
    const result = await ctx.runRebuild();
    expect(result.ok).toBe(true);
    // Linux rebuilds must not fall through to nixos-rebuild.
    expect(calls.find((c) => c.args[0] === 'nixos-rebuild')).toBeUndefined();
    expect(calls.find((c) => c.args[0] === 'darwin-rebuild')).toBeUndefined();
    // System layer goes through sudo + resolved system-manager path.
    expect(
      calls.find(
        (c) =>
          c.cmd === 'sudo' &&
          c.args[0] === '/home/alice/.nix-profile/bin/system-manager' &&
          c.args[1] === 'switch'
      )
    ).toBeDefined();
    // User layer is home-manager, no sudo.
    expect(calls.find((c) => c.cmd === 'home-manager' && c.args[0] === 'switch')).toBeDefined();
  });

  it('linux runRebuild falls back to `nix run` when home-manager is missing on PATH', async () => {
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'git@github.com:example/kit.git',
        gitStrategy: 'none',
        machines: { lnx: { type: 'linux', user: 'alice' } },
      })
    );
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const exec = {
      run: async (cmd: string, args: readonly string[]) => {
        calls.push({ cmd, args: Array.from(args) });
        if (cmd === 'which' && args[0] === 'system-manager')
          return { code: 0, stdout: '/home/alice/.nix-profile/bin/system-manager\n', stderr: '' };
        if (cmd === 'which' && args[0] === 'home-manager')
          return { code: 1, stdout: '', stderr: 'not found' };
        return { code: 0, stdout: '', stderr: '' };
      },
    };
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'lnx',
      exec,
    });
    const result = await ctx.runRebuild();
    expect(result.ok).toBe(true);
    expect(
      calls.find(
        (c) =>
          c.cmd === 'nix' &&
          c.args[0] === 'run' &&
          c.args[1] === 'github:nix-community/home-manager'
      )
    ).toBeDefined();
  });

  it('linux runRebuild surfaces system-manager failure without running home-manager', async () => {
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'git@github.com:example/kit.git',
        gitStrategy: 'none',
        machines: { lnx: { type: 'linux', user: 'alice' } },
      })
    );
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const exec = {
      run: async (cmd: string, args: readonly string[]) => {
        calls.push({ cmd, args: Array.from(args) });
        if (cmd === 'which') return { code: 0, stdout: '/x/bin/system-manager\n', stderr: '' };
        if (cmd === 'sudo') return { code: 1, stdout: '', stderr: 'sm failed' };
        return { code: 0, stdout: '', stderr: '' };
      },
    };
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'lnx',
      exec,
    });
    const result = await ctx.runRebuild();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('sm failed');
    // Must not have proceeded to home-manager.
    expect(calls.find((c) => c.cmd === 'home-manager')).toBeUndefined();
    // Note: presence of `nix run` in calls would indicate the bootstrap fallback
    // was taken; here `which system-manager` succeeded, so we want the installed
    // path only and no fallback.
    expect(calls.find((c) => c.cmd === 'nix' && c.args[0] === 'run')).toBeUndefined();
  });

  it('linux runRebuild falls back to `sudo nix run github:numtide/system-manager` when system-manager is not installed (fresh remote rebuild)', async () => {
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'git@github.com:example/kit.git',
        gitStrategy: 'none',
        machines: { lnx: { type: 'linux', user: 'alice' } },
      })
    );
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const exec = {
      run: async (cmd: string, args: readonly string[]) => {
        calls.push({ cmd, args: Array.from(args) });
        if (cmd === 'which' && args[0] === 'system-manager')
          return { code: 1, stdout: '', stderr: 'not found' };
        if (cmd === 'which' && args[0] === 'nix')
          return { code: 0, stdout: '/nix/var/nix/profiles/default/bin/nix\n', stderr: '' };
        if (cmd === 'which' && args[0] === 'home-manager')
          return { code: 0, stdout: '/home/alice/.nix-profile/bin/home-manager\n', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
      },
    };
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'lnx',
      exec,
    });
    const result = await ctx.runRebuild();
    expect(result.ok).toBe(true);
    expect(
      calls.find(
        (c) =>
          c.cmd === 'sudo' &&
          c.args[0] === '/nix/var/nix/profiles/default/bin/nix' &&
          c.args[1] === 'run' &&
          c.args[2] === 'github:numtide/system-manager'
      )
    ).toBeDefined();
    // Bare-name `sudo system-manager …` must NOT be attempted (Codex P1 sweep).
    expect(calls.find((c) => c.cmd === 'sudo' && c.args[0] === 'system-manager')).toBeUndefined();
  });

  it('linux runRebuild probes Determinate Nix path when `which nix` misses (non-login agent session)', async () => {
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'git@github.com:example/kit.git',
        gitStrategy: 'none',
        machines: { lnx: { type: 'linux', user: 'alice' } },
      })
    );
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const exec = {
      run: async (cmd: string, args: readonly string[]) => {
        calls.push({ cmd, args: Array.from(args) });
        if (cmd === 'which' && args[0] === 'system-manager')
          return { code: 1, stdout: '', stderr: 'not found' };
        if (cmd === 'which' && args[0] === 'nix')
          return { code: 1, stdout: '', stderr: 'not found' };
        if (
          cmd === 'test' &&
          args[0] === '-x' &&
          args[1] === '/nix/var/nix/profiles/default/bin/nix'
        )
          return { code: 0, stdout: '', stderr: '' };
        if (cmd === 'which' && args[0] === 'home-manager')
          return { code: 0, stdout: '/home/alice/.nix-profile/bin/home-manager\n', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
      },
    };
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'lnx',
      exec,
    });
    const result = await ctx.runRebuild();
    expect(result.ok).toBe(true);
    // Sudo invocation must use the resolved canonical path, never bare `nix`.
    expect(
      calls.find(
        (c) =>
          c.cmd === 'sudo' &&
          c.args[0] === '/nix/var/nix/profiles/default/bin/nix' &&
          c.args[1] === 'run'
      )
    ).toBeDefined();
    expect(calls.find((c) => c.cmd === 'sudo' && c.args[0] === 'nix')).toBeUndefined();
  });

  it('linux runRebuild returns a helpful failure when nix cannot be located', async () => {
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'git@github.com:example/kit.git',
        gitStrategy: 'none',
        machines: { lnx: { type: 'linux', user: 'alice' } },
      })
    );
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const exec = {
      run: async (cmd: string, args: readonly string[]) => {
        calls.push({ cmd, args: Array.from(args) });
        if (cmd === 'which') return { code: 1, stdout: '', stderr: 'not found' };
        if (cmd === 'test') return { code: 1, stdout: '', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
      },
    };
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'lnx',
      exec,
    });
    const result = await ctx.runRebuild();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Could not locate `nix`');
    // Must not have shelled out to bare `nix` under sudo.
    expect(calls.find((c) => c.cmd === 'sudo' && c.args[0] === 'nix')).toBeUndefined();
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

  it('passes --literal-pathspecs as a top-level git option before the add subcommand (Codex P1 sweep — git add does not accept --literal-pathspecs as a subcommand option)', async () => {
    const exec = fakeExec();
    const ctx = await resolveKitContext({
      kitConfigPath: join(dir, 'kit.config.json'),
      machineId: 'm1',
      exec,
    });
    await ctx.commitAndPush('msg', ['modules/configuration.nix']);
    const addCall = exec.calls.find(
      (c) => c.cmd === 'git' && c.args.includes('add') && c.args.includes('--literal-pathspecs')
    );
    expect(addCall).toBeDefined();
    // Order matters: the global option must precede the subcommand.
    const flagIdx = addCall?.args.indexOf('--literal-pathspecs') ?? -1;
    const addIdx = addCall?.args.indexOf('add') ?? -1;
    expect(flagIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeGreaterThan(flagIdx);
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
    const addCall = exec.calls.find((c) => c.cmd === 'git' && c.args.includes('add'));
    expect(addCall).toBeDefined();
    // The legacy fallback resolves to machines/m1.apps.json or apps/apps.json.
    const lastArg = addCall?.args[addCall.args.length - 1] ?? '';
    expect(lastArg.endsWith('.apps.json')).toBe(true);
  });
});
