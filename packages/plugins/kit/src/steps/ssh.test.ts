// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sshStep } from './ssh.js';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ssh-'));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('sshStep', () => {
  it('check true when ed25519 key exists', async () => {
    mkdirSync(join(home, '.ssh'));
    writeFileSync(join(home, '.ssh', 'id_ed25519'), 'fake');
    expect(
      await sshStep.check({ exec: { run: vi.fn(), spawn: vi.fn() }, env: { HOME: home } })
    ).toBe(true);
  });

  it('check false when no key exists', async () => {
    expect(
      await sshStep.check({ exec: { run: vi.fn(), spawn: vi.fn() }, env: { HOME: home } })
    ).toBe(false);
  });

  it('check false without a step context', async () => {
    expect(await sshStep.check()).toBe(false);
  });

  it('run calls ssh-keygen', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await sshStep.run({ exec, env: { HOME: home, KIT_MACHINE: 'ali-pro' } });
    const [cmd, args] =
      exec.run.mock.calls.find((c: (string | string[])[]) => c[0] === 'ssh-keygen') ?? [];
    expect(cmd).toBe('ssh-keygen');
    expect(args).toContain('-t');
    expect(args).toContain('ed25519');
  });

  it('run defaults the key comment when KIT_MACHINE is absent', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };

    await sshStep.run({ exec, env: { HOME: home } });

    const keygen = exec.run.mock.calls.find((c: (string | string[])[]) => c[0] === 'ssh-keygen');
    expect(keygen?.[1]).toContain('kit-machine');
  });

  it('run throws when ssh-keygen fails', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd === 'ssh-keygen') return { stdout: '', stderr: 'keygen failed', code: 1 };
        return { stdout: '', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };

    await expect(sshStep.run({ exec, env: { HOME: home } })).rejects.toMatchObject({
      code: 'KIT_SSH_KEYGEN_FAILED',
      cause: 'keygen failed',
    });
  });
});
