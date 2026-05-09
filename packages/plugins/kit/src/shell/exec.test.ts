// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { realExec } from './exec.js';

describe('realExec.run', () => {
  it('captures stdout and exit code on success', async () => {
    const result = await realExec.run('node', ['-e', 'process.stdout.write("hi")']);
    expect(result.stdout.trim()).toBe('hi');
    expect(result.code).toBe(0);
  });

  it('captures stderr and non-zero exit on failure', async () => {
    const result = await realExec.run('node', ['-e', 'process.exit(2)']);
    expect(result.code).toBe(2);
  });

  it('reports spawn errors as command failures', async () => {
    const result = await realExec.run('__pilot_missing_command__', []);
    expect(result).toEqual({ stdout: '', stderr: '', code: 1 });
  });

  it('clears buffered timeouts when spawn errors', async () => {
    const result = await realExec.run('__pilot_missing_command__', [], { timeoutMs: 1000 });
    expect(result).toEqual({ stdout: '', stderr: '', code: 1 });
  });

  it('honors the cwd option', async () => {
    const result = await realExec.run('node', ['-e', 'process.stdout.write(process.cwd())'], {
      cwd: '/tmp',
    });
    // On macOS, /tmp is symlinked to /private/tmp
    expect(['/tmp', '/private/tmp']).toContain(result.stdout.trim());
  });

  it('does not hang when child reads stdin and no input is provided', async () => {
    // Without closing stdin, this would wait forever for EOF.
    const result = await realExec.run(
      'node',
      ['-e', 'process.stdin.on("end", () => process.exit(0)); process.stdin.resume();'],
      { timeoutMs: 5000 }
    );
    // If stdin isn't closed, the timeout fires (code 124). Should be a clean 0.
    expect(result.code).toBe(0);
  });

  it('forwards opts.input when provided', async () => {
    const result = await realExec.run(
      'node',
      [
        '-e',
        'let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>process.stdout.write(d))',
      ],
      { input: 'hello' }
    );
    expect(result.stdout).toBe('hello');
    expect(result.code).toBe(0);
  });

  it('reports timeout as code 124 with marker in stderr', async () => {
    const result = await realExec.run('node', ['-e', 'setTimeout(() => {}, 60000)'], {
      timeoutMs: 200,
    });
    expect(result.code).toBe(124);
    expect(result.stderr).toContain('timeout after 200ms');
  });

  it('reports signal exits with captured stderr', async () => {
    const result = await realExec.run('node', [
      '-e',
      'process.stderr.write("before"); process.kill(process.pid, "SIGTERM")',
    ]);

    expect(result.code).toBe(128);
    expect(result.stderr).toBe('before\n[kit] killed by signal SIGTERM');
  });

  it('interactive mode skips capture and returns exit code', async () => {
    // We can't truly test TTY without one, but we can verify the code path runs.
    // Use /bin/true which exits 0 immediately.
    const result = await realExec.run('true', [], { interactive: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(''); // not captured in interactive mode
  });

  it('interactive mode reports timeout without captured output', async () => {
    const result = await realExec.run('node', ['-e', 'setTimeout(() => {}, 60000)'], {
      interactive: true,
      timeoutMs: 200,
    });

    expect(result).toEqual({ stdout: '', stderr: '[kit] killed: timeout after 200ms', code: 124 });
  });

  it('interactive mode reports signal exits', async () => {
    const result = await realExec.run('node', ['-e', 'process.kill(process.pid, "SIGTERM")'], {
      interactive: true,
    });

    expect(result).toEqual({ stdout: '', stderr: '[kit] killed by signal SIGTERM', code: 128 });
  });

  it('interactive mode reports spawn errors as failures', async () => {
    const result = await realExec.run('__pilot_missing_command__', [], { interactive: true });

    expect(result).toEqual({ stdout: '', stderr: '', code: 1 });
  });

  it('clears interactive timeouts when spawn errors', async () => {
    const result = await realExec.run('__pilot_missing_command__', [], {
      interactive: true,
      timeoutMs: 1000,
    });

    expect(result).toEqual({ stdout: '', stderr: '', code: 1 });
  });
});

describe('realExec.spawn', () => {
  it('captures stdout from spawned commands', async () => {
    const spawned = realExec.spawn('node', ['-e', 'process.stdout.write("spawned")']);

    await expect(spawned.done).resolves.toEqual({
      stdout: 'spawned',
      stderr: '',
      code: 0,
    });
  });

  it('reports spawn errors through the done promise', async () => {
    const spawned = realExec.spawn('__pilot_missing_command__', []);

    await expect(spawned.done).resolves.toEqual({ stdout: '', stderr: '', code: 1 });
  });

  it('interactive spawned commands return only an exit code', async () => {
    const spawned = realExec.spawn('true', [], { interactive: true });

    await expect(spawned.done).resolves.toEqual({ stdout: '', stderr: '', code: 0 });
  });
});
