// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitError } from '../errors.js';
import { scaffoldKit } from './new.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'new-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scaffoldKit', () => {
  it('writes the expected files into a fresh directory', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const target = join(dir, 'my-kit');
    await scaffoldKit({ target, name: 'my-kit', machine: 'my-mac', user: 'me', exec });
    expect(existsSync(join(target, 'kit.config.json'))).toBe(true);
    expect(existsSync(join(target, 'flake.nix'))).toBe(true);
    expect(existsSync(join(target, 'machines', 'my-mac.nix'))).toBe(true);
    expect(existsSync(join(target, 'machines', 'my-mac.apps.json'))).toBe(true);
    expect(existsSync(join(target, '.gitignore'))).toBe(true);
    const cfg = JSON.parse(readFileSync(join(target, 'kit.config.json'), 'utf8'));
    expect(cfg.machines['my-mac']).toEqual({ type: 'darwin', user: 'me' });
    // Scaffolded config should NOT hardcode repoDir — the loader derives it from the file's location.
    expect(cfg.repoDir).toBeUndefined();
    // flake.nix should produce a usable darwinConfigurations entry, not an empty stub.
    const flake = readFileSync(join(target, 'flake.nix'), 'utf8');
    expect(flake).toContain('darwinConfigurations.my-mac');
    expect(flake).toContain('nix-darwin');
  });

  it('initializes git', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await scaffoldKit({ target: join(dir, 'k2'), name: 'k2', machine: 'm', user: 'u', exec });
    const gitInit = exec.run.mock.calls.find((c) => c[0] === 'git' && c[1][0] === 'init');
    expect(gitInit).toBeDefined();
  });

  it('scaffolds nixos machines when requested', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const target = join(dir, 'linux-kit');

    await scaffoldKit({
      target,
      name: 'linux-kit',
      machine: 'nixos-box',
      user: 'ali',
      type: 'nixos',
      exec,
    });

    const flake = readFileSync(join(target, 'flake.nix'), 'utf8');
    const machine = readFileSync(join(target, 'machines', 'nixos-box.nix'), 'utf8');
    expect(flake).toContain('nixosConfigurations.nixos-box');
    expect(flake).toContain('/home/ali');
    expect(machine).toContain('networking.hostName = "nixos-box";');
    expect(machine).not.toContain('homebrew');
  });

  it('throws KitError when git init fails', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        if (args[0] === 'init') return { stdout: '', stderr: 'permission denied', code: 1 };
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    let caught: unknown;
    try {
      await scaffoldKit({ target: join(dir, 'k3'), name: 'k3', machine: 'm', user: 'u', exec });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(KitError);
    expect(String((caught as KitError).cause)).toContain('git init failed');
    expect(String((caught as KitError).cause)).toContain('permission denied');
  });

  it('uses the exit code in git failure details when stderr is empty', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        if (args[0] === 'commit') return { stdout: '', stderr: '', code: 7 };
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    await expect(
      scaffoldKit({ target: join(dir, 'k4'), name: 'k4', machine: 'm', user: 'u', exec })
    ).rejects.toMatchObject({
      code: 'KIT_REPO_CLONE_FAILED',
      cause: expect.stringContaining('exit 7'),
    });
  });
});
