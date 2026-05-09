// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import type { Exec } from '../shell/exec.js';
import { detectPackageManagers } from './detect.js';

function makeExec(available: string[]): Exec {
  return {
    run: vi.fn().mockImplementation(async (cmd: string) => {
      return available.includes(cmd)
        ? { stdout: '1.0.0', stderr: '', code: 0 }
        : { stdout: '', stderr: 'not found', code: 1 };
    }),
  };
}

describe('detectPackageManagers', () => {
  it('detects nix and npm when available', async () => {
    const exec = makeExec(['nix', 'npm']);
    const result = await detectPackageManagers(exec);
    expect(result.nix).toBe(true);
    expect(result.brew).toBe(false);
    expect(result.winget).toBe(false);
    expect(result.npm).toBe(true);
  });

  it('detects brew when available', async () => {
    const exec = makeExec(['brew', 'npm']);
    const result = await detectPackageManagers(exec);
    expect(result.brew).toBe(true);
    expect(result.nix).toBe(false);
  });

  it('detects winget when available', async () => {
    const exec = makeExec(['winget', 'npm']);
    const result = await detectPackageManagers(exec);
    expect(result.winget).toBe(true);
  });

  it('returns all false when nothing is available', async () => {
    const exec = makeExec([]);
    const result = await detectPackageManagers(exec);
    expect(result).toEqual({ nix: false, brew: false, winget: false, npm: false });
  });
});
