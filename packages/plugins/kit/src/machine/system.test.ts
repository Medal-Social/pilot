// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { getSystemInfo } from './system.js';

describe('getSystemInfo', () => {
  it('reports darwin + apple silicon', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'sw_vers' && args[0] === '-productName')
          return { stdout: 'macOS\n', stderr: '', code: 0 };
        if (cmd === 'sw_vers' && args[0] === '-productVersion')
          return { stdout: '15.4\n', stderr: '', code: 0 };
        return { stdout: '', stderr: '', code: 1 };
      }),
      spawn: vi.fn(),
    };
    const info = await getSystemInfo({ exec, platform: 'darwin', arch: 'arm64' });
    expect(info.os).toBe('macOS');
    expect(info.osVersion).toBe('15.4');
    expect(info.chip).toBe('Apple Silicon');
  });

  it('reports linux + intel', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 1 }),
      spawn: vi.fn(),
    };
    const info = await getSystemInfo({ exec, platform: 'linux', arch: 'x64' });
    expect(info.os).toBe('Linux');
    expect(info.chip).toBe('Intel');
  });

  it('uses the raw platform name for non-darwin/non-linux platforms', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 1 }),
      spawn: vi.fn(),
    };

    const info = await getSystemInfo({ exec, platform: 'freebsd', arch: 'x64', user: 'ali' });

    expect(info).toEqual({ os: 'freebsd', osVersion: '', chip: 'Intel', user: 'ali' });
  });

  it('falls back when darwin version probes fail or return blank names', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '\n', stderr: '', code: 1 }),
      spawn: vi.fn(),
    };

    const info = await getSystemInfo({ exec, platform: 'darwin', arch: 'x64', user: 'ali' });

    expect(info.os).toBe('macOS');
    expect(info.osVersion).toBe('');
  });
});
