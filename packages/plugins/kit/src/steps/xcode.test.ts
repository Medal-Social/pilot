// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { xcodeStep } from './xcode.js';

const ctx = (
  runImpl: (
    cmd: string,
    args: string[]
  ) => Promise<{
    stdout: string;
    stderr: string;
    code: number;
  }>
) => ({
  exec: { run: vi.fn(runImpl), spawn: vi.fn() },
});

describe('xcodeStep', () => {
  it('check returns true when xcode-select -p succeeds', async () => {
    const c = ctx(async () => ({ stdout: '/Library/Developer', stderr: '', code: 0 }));
    expect(await xcodeStep.check(c)).toBe(true);
  });

  it('check returns false when xcode-select -p fails', async () => {
    const c = ctx(async () => ({ stdout: '', stderr: '', code: 2 }));
    expect(await xcodeStep.check(c)).toBe(false);
  });

  it('check returns false without a step context', async () => {
    expect(await xcodeStep.check()).toBe(false);
  });

  it('run shells out to softwareupdate', async () => {
    const calls: string[] = [];
    const c = ctx(async (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      if (cmd === 'softwareupdate' && args[0] === '-l')
        return {
          stdout: '* Label: Command Line Tools for Xcode-15.0\n',
          stderr: '',
          code: 0,
        };
      return { stdout: '', stderr: '', code: 0 };
    });
    await xcodeStep.run(c);
    expect(calls.some((c) => c.startsWith('softwareupdate -i'))).toBe(true);
  });

  it('throws when softwareupdate does not list a CLT label', async () => {
    const c = ctx(async (cmd, args) => {
      if (cmd === 'softwareupdate' && args[0] === '-l')
        return { stdout: 'No new software available.\n', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    await expect(xcodeStep.run(c)).rejects.toMatchObject({
      code: 'KIT_XCODE_INSTALL_FAILED',
      cause: 'no CLT label found',
    });
  });

  it('throws when CLT installation fails', async () => {
    const c = ctx(async (cmd, args) => {
      if (cmd === 'softwareupdate' && args[0] === '-l')
        return {
          stdout: '* Label: Command Line Tools for Xcode-15.0\n',
          stderr: '',
          code: 0,
        };
      if (cmd === 'softwareupdate' && args[0] === '-i')
        return { stdout: '', stderr: 'install failed', code: 1 };
      return { stdout: '', stderr: '', code: 0 };
    });

    await expect(xcodeStep.run(c)).rejects.toMatchObject({
      code: 'KIT_XCODE_INSTALL_FAILED',
      cause: 'install failed',
    });
  });
});
