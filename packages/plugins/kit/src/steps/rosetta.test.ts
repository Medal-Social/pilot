// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { rosettaStep } from './rosetta.js';

const exec = (rc: number) => ({
  run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: rc }),
  spawn: vi.fn(),
});

describe('rosettaStep', () => {
  it('check true when oahd is present', async () => {
    expect(await rosettaStep.check({ exec: exec(0) })).toBe(true);
  });

  it('check false when oahd is missing', async () => {
    expect(await rosettaStep.check({ exec: exec(1) })).toBe(false);
  });

  it('check false without a step context', async () => {
    expect(await rosettaStep.check()).toBe(false);
  });

  it('run installs rosetta', async () => {
    const ctx = {
      exec: {
        run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
        spawn: vi.fn(),
      },
    };
    await rosettaStep.run(ctx);
    expect(ctx.exec.run).toHaveBeenCalledWith('softwareupdate', [
      '--install-rosetta',
      '--agree-to-license',
    ]);
  });

  it('run throws when Rosetta install fails', async () => {
    const ctx = {
      exec: {
        run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'install failed', code: 1 }),
        spawn: vi.fn(),
      },
    };

    await expect(rosettaStep.run(ctx)).rejects.toMatchObject({
      code: 'KIT_ROSETTA_INSTALL_FAILED',
      cause: 'install failed',
    });
  });
});
