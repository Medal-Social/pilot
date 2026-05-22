// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { rebuildStep } from './rebuild.js';

describe('rebuildStep', () => {
  it('check returns false (always runs)', async () => {
    expect(
      await rebuildStep.check({
        exec: { run: vi.fn(), spawn: vi.fn() },
        env: {},
      })
    ).toBe(false);
  });

  it('run executes darwin-rebuild for darwin machine', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await rebuildStep.run({
      exec,
      env: {
        KIT_MACHINE_TYPE: 'darwin',
        KIT_MACHINE: 'ali-pro',
        KIT_REPO_DIR: '/nix/config',
      },
    });
    expect(exec.run).toHaveBeenCalledWith(
      'sudo',
      ['darwin-rebuild', 'switch', '--flake', '.#ali-pro'],
      { cwd: '/nix/config' }
    );
  });

  it('run executes nixos-rebuild for nixos machine', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await rebuildStep.run({
      exec,
      env: {
        KIT_MACHINE_TYPE: 'nixos',
        KIT_MACHINE: 'ali-server',
        KIT_REPO_DIR: '/nix/config',
      },
    });
    expect(exec.run).toHaveBeenCalledWith(
      'sudo',
      ['nixos-rebuild', 'switch', '--flake', '.#ali-server'],
      { cwd: '/nix/config' }
    );
  });

  it('run throws when KIT_MACHINE_TYPE missing', async () => {
    const exec = { run: vi.fn(), spawn: vi.fn() };
    await expect(
      rebuildStep.run({
        exec,
        env: { KIT_MACHINE: 'ali-pro', KIT_REPO_DIR: '/nix/config' },
      })
    ).rejects.toThrow();
  });

  it('run throws when KIT_MACHINE missing', async () => {
    const exec = { run: vi.fn(), spawn: vi.fn() };
    await expect(
      rebuildStep.run({
        exec,
        env: { KIT_MACHINE_TYPE: 'darwin', KIT_REPO_DIR: '/nix/config' },
      })
    ).rejects.toThrow();
  });

  it('run throws when KIT_REPO_DIR missing', async () => {
    const exec = { run: vi.fn(), spawn: vi.fn() };
    await expect(
      rebuildStep.run({
        exec,
        env: { KIT_MACHINE_TYPE: 'darwin', KIT_MACHINE: 'ali-pro' },
      })
    ).rejects.toThrow();
  });

  it('run throws when rebuild command fails', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({
        stdout: '',
        stderr: 'build error',
        code: 1,
      }),
      spawn: vi.fn(),
    };
    await expect(
      rebuildStep.run({
        exec,
        env: {
          KIT_MACHINE_TYPE: 'darwin',
          KIT_MACHINE: 'ali-pro',
          KIT_REPO_DIR: '/nix/config',
        },
      })
    ).rejects.toThrow();
  });

  describe('linux platform', () => {
    it('runs system-manager + home-manager when home-manager is on PATH', async () => {
      const exec = {
        run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
          if (cmd === 'which' && args[0] === 'system-manager')
            return { stdout: '/home/alice/.nix-profile/bin/system-manager\n', stderr: '', code: 0 };
          if (cmd === 'which' && args[0] === 'home-manager')
            return { stdout: '/home/alice/.nix-profile/bin/home-manager\n', stderr: '', code: 0 };
          return { stdout: '', stderr: '', code: 0 };
        }),
        spawn: vi.fn(),
      };
      await rebuildStep.run({
        exec,
        env: {
          KIT_MACHINE_TYPE: 'linux',
          KIT_MACHINE: 'my-vm',
          KIT_REPO_DIR: '/home/alice/kit',
        },
      });
      // Resolve binaries via `which` so sudo (PATH-stripped) can find them.
      expect(exec.run).toHaveBeenCalledWith('which', ['system-manager']);
      expect(exec.run).toHaveBeenCalledWith(
        'sudo',
        ['/home/alice/.nix-profile/bin/system-manager', 'switch', '--flake', '.#my-vm'],
        { cwd: '/home/alice/kit' }
      );
      expect(exec.run).toHaveBeenCalledWith('which', ['home-manager']);
      expect(exec.run).toHaveBeenCalledWith('home-manager', ['switch', '--flake', '.#my-vm'], {
        cwd: '/home/alice/kit',
      });
    });

    it('falls back to `<abs-nix> run` (not bare `nix`) when home-manager is not on PATH', async () => {
      const exec = {
        run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
          if (cmd === 'which' && args[0] === 'system-manager')
            return { stdout: '/home/alice/.nix-profile/bin/system-manager\n', stderr: '', code: 0 };
          if (cmd === 'which' && args[0] === 'home-manager')
            return { stdout: '', stderr: 'not found', code: 1 };
          if (cmd === 'which' && args[0] === 'nix')
            return { stdout: '/nix/var/nix/profiles/default/bin/nix\n', stderr: '', code: 0 };
          return { stdout: '', stderr: '', code: 0 };
        }),
        spawn: vi.fn(),
      };
      await rebuildStep.run({
        exec,
        env: {
          KIT_MACHINE_TYPE: 'linux',
          KIT_MACHINE: 'my-vm',
          KIT_REPO_DIR: '/home/alice/kit',
        },
      });
      expect(exec.run).toHaveBeenCalledWith(
        '/nix/var/nix/profiles/default/bin/nix',
        ['run', 'github:nix-community/home-manager', '--', 'switch', '--flake', '.#my-vm'],
        { cwd: '/home/alice/kit' }
      );
      // Bare `nix run …` must not be attempted (Codex P1 sweep — non-login
      // sessions can have nix installed but not on PATH).
      const bareNix = (exec.run as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[0] === 'nix' && c[1]?.[0] === 'run'
      );
      expect(bareNix).toBeUndefined();
    });

    it('falls back to `sudo nix run github:numtide/system-manager` when system-manager is not on PATH (fresh bootstrap)', async () => {
      const exec = {
        run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
          if (cmd === 'which' && args[0] === 'system-manager')
            return { stdout: '', stderr: 'not found', code: 1 };
          if (cmd === 'which' && args[0] === 'nix')
            return { stdout: '/nix/var/nix/profiles/default/bin/nix\n', stderr: '', code: 0 };
          if (cmd === 'which' && args[0] === 'home-manager')
            return { stdout: '/x/bin/home-manager', stderr: '', code: 0 };
          return { stdout: '', stderr: '', code: 0 };
        }),
        spawn: vi.fn(),
      };
      await rebuildStep.run({
        exec,
        env: {
          KIT_MACHINE_TYPE: 'linux',
          KIT_MACHINE: 'my-vm',
          KIT_REPO_DIR: '/home/alice/kit',
        },
      });
      // System layer: sudo + absolute nix path + `nix run github:numtide/system-manager -- switch`.
      expect(exec.run).toHaveBeenCalledWith(
        'sudo',
        [
          '/nix/var/nix/profiles/default/bin/nix',
          'run',
          'github:numtide/system-manager',
          '--',
          'switch',
          '--flake',
          '.#my-vm',
        ],
        { cwd: '/home/alice/kit' }
      );
      // Must NOT fall through to running the bare-name `sudo system-manager …`.
      const sudoSm = (exec.run as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[0] === 'sudo' && c[1]?.[0] === 'system-manager'
      );
      expect(sudoSm).toBeUndefined();
    });

    it('probes Determinate Nix install path when `which nix` also misses (non-login session)', async () => {
      const exec = {
        run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
          if (cmd === 'which' && args[0] === 'system-manager')
            return { stdout: '', stderr: 'not found', code: 1 };
          if (cmd === 'which' && args[0] === 'nix')
            return { stdout: '', stderr: 'not found', code: 1 };
          if (
            cmd === 'test' &&
            args[0] === '-x' &&
            args[1] === '/nix/var/nix/profiles/default/bin/nix'
          )
            return { stdout: '', stderr: '', code: 0 };
          if (cmd === 'which' && args[0] === 'home-manager')
            return { stdout: '/x/bin/home-manager', stderr: '', code: 0 };
          return { stdout: '', stderr: '', code: 0 };
        }),
        spawn: vi.fn(),
      };
      await rebuildStep.run({
        exec,
        env: {
          KIT_MACHINE_TYPE: 'linux',
          KIT_MACHINE: 'my-vm',
          KIT_REPO_DIR: '/home/alice/kit',
        },
      });
      // Falls back to the Determinate canonical path under sudo (Codex P1 sweep —
      // bare-name `nix` would never have resolved under sudo).
      expect(exec.run).toHaveBeenCalledWith(
        'sudo',
        [
          '/nix/var/nix/profiles/default/bin/nix',
          'run',
          'github:numtide/system-manager',
          '--',
          'switch',
          '--flake',
          '.#my-vm',
        ],
        { cwd: '/home/alice/kit' }
      );
      // Bare-name `sudo nix …` must never be attempted.
      const bareNix = (exec.run as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[0] === 'sudo' && c[1]?.[0] === 'nix'
      );
      expect(bareNix).toBeUndefined();
    });

    it('throws KIT_REBUILD_FAILED with a helpful cause when neither system-manager nor nix can be located', async () => {
      const exec = {
        run: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd === 'which') return { stdout: '', stderr: 'not found', code: 1 };
          if (cmd === 'test') return { stdout: '', stderr: '', code: 1 };
          return { stdout: '', stderr: '', code: 0 };
        }),
        spawn: vi.fn(),
      };
      await expect(
        rebuildStep.run({
          exec,
          env: {
            KIT_MACHINE_TYPE: 'linux',
            KIT_MACHINE: 'my-vm',
            KIT_REPO_DIR: '/home/alice/kit',
          },
        })
      ).rejects.toMatchObject({
        code: 'KIT_REBUILD_FAILED',
        cause: expect.stringContaining('Could not locate `nix`'),
      });
    });

    it('throws when system-manager switch fails', async () => {
      const exec = {
        run: vi.fn().mockImplementation(async (cmd: string) => {
          if (cmd === 'which') return { stdout: '/x/bin/system-manager', stderr: '', code: 0 };
          if (cmd === 'sudo') return { stdout: '', stderr: 'system-manager build error', code: 1 };
          return { stdout: '', stderr: '', code: 0 };
        }),
        spawn: vi.fn(),
      };
      await expect(
        rebuildStep.run({
          exec,
          env: {
            KIT_MACHINE_TYPE: 'linux',
            KIT_MACHINE: 'my-vm',
            KIT_REPO_DIR: '/home/alice/kit',
          },
        })
      ).rejects.toThrow();
    });

    it('throws when home-manager switch fails', async () => {
      const exec = {
        run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
          if (cmd === 'which' && args[0] === 'system-manager')
            return { stdout: '/x/bin/system-manager', stderr: '', code: 0 };
          if (cmd === 'which' && args[0] === 'home-manager')
            return { stdout: '/x/bin/home-manager', stderr: '', code: 0 };
          if (cmd === 'sudo') return { stdout: '', stderr: '', code: 0 };
          if (cmd === 'home-manager')
            return { stdout: '', stderr: 'home-manager build error', code: 1 };
          return { stdout: '', stderr: '', code: 0 };
        }),
        spawn: vi.fn(),
      };
      await expect(
        rebuildStep.run({
          exec,
          env: {
            KIT_MACHINE_TYPE: 'linux',
            KIT_MACHINE: 'my-vm',
            KIT_REPO_DIR: '/home/alice/kit',
          },
        })
      ).rejects.toThrow();
    });
  });
});
