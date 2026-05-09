// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { KitError } from '../errors.js';
import { nixStep } from './nix.js';

describe('nixStep', () => {
  it('check true when nix --version succeeds', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: 'nix (Nix) 2.18.0', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    expect(await nixStep.check({ exec })).toBe(true);
  });

  it('check false when nix is missing', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 127 }),
      spawn: vi.fn(),
    };
    expect(await nixStep.check({ exec })).toBe(false);
  });

  it('check false without a step context', async () => {
    expect(await nixStep.check()).toBe(false);
  });

  it('run pipes the determinate installer through sh', async () => {
    const exec = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: 'installer-script', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    await nixStep.run({ exec });
    expect(exec.run).toHaveBeenCalledTimes(2);
    const [first] = exec.run.mock.calls[0];
    expect(first).toBe('curl');
    const [second] = exec.run.mock.calls[1];
    expect(second).toBe('sh');
  });

  it('run throws on installer failure', async () => {
    const exec = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: 'installer', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'boom', code: 1 }),
      spawn: vi.fn(),
    };
    await expect(nixStep.run({ exec })).rejects.toBeInstanceOf(KitError);
  });

  it('run throws on download failure', async () => {
    const exec = {
      run: vi.fn().mockResolvedValueOnce({ stdout: '', stderr: 'curl failed', code: 1 }),
      spawn: vi.fn(),
    };

    await expect(nixStep.run({ exec })).rejects.toMatchObject({
      code: 'KIT_NIX_INSTALL_FAILED',
      cause: 'curl failed',
    });
  });
});
