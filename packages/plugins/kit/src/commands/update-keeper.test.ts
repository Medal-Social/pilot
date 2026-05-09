// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { realSudoKeeper } from './update.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn((_event, callback: () => void) => {
      callback();
    }),
  })),
}));

describe('realSudoKeeper', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('refreshes sudo while running and stops its interval', () => {
    vi.useFakeTimers();

    const stop = realSudoKeeper.start();
    vi.advanceTimersByTime(30_000);

    expect(spawn).toHaveBeenCalledWith('sudo', ['-v'], { stdio: 'ignore' });

    stop();
    vi.advanceTimersByTime(30_000);

    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
