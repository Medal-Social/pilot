// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { realExec } from './exec.js';

describe('realExec', () => {
  it('captures stdout from a successful command', async () => {
    const result = await realExec.run('node', ['-e', 'process.stdout.write("hi")']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('hi');
    expect(result.stderr).toBe('');
  });

  it('captures stderr and non-zero exit code from a failing command', async () => {
    const result = await realExec.run('node', [
      '-e',
      'process.stderr.write("oops"); process.exit(2)',
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('oops');
  });

  it('resolves with code 1 when the command cannot be spawned', async () => {
    const result = await realExec.run('definitely-not-a-real-binary-xyz', ['--help']);
    expect(result.code).toBe(1);
  });

  it('passes custom env and cwd to the child process', async () => {
    const result = await realExec.run(
      'node',
      ['-e', 'process.stdout.write(process.env.CUSTOM_VAR ?? "missing")'],
      { env: { ...process.env, CUSTOM_VAR: 'set' }, cwd: process.cwd() }
    );
    expect(result.stdout).toContain('set');
  });
});
