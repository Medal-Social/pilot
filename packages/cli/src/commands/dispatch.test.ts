// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shell/exec.js', () => ({
  realExec: { run: vi.fn() },
  runInherit: vi.fn(async () => 0),
}));

vi.mock('../plugins/dispatch-loader.js', () => ({
  loadDispatchPlugin: vi.fn(async () => ({
    manifest: { name: 'dispatch', namespace: 'medalsocial', provides: { commands: [] } },
    syncStream: () => (async function* () {})(),
    applyRemote: async () => {},
    health: async () => ({ ok: true, details: { migrationsApplied: true } }),
  })),
}));

let stdout: string;
let stderr: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdout = '';
  stderr = '';
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString();
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString();
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  vi.resetModules();
});

describe('runDispatchStatus', () => {
  it('writes the plugin health JSON to stdout (no console.log)', async () => {
    const { runDispatchStatus } = await import('./dispatch.js');
    await runDispatchStatus();
    expect(stdout).toContain('migrationsApplied');
    // Must use process.stdout.write, never console.log.
    expect(stdout.endsWith('\n')).toBe(true);
  });

  it('throws PilotError DISPATCH_UNAVAILABLE when the plugin is not installed', async () => {
    const loader = await import('../plugins/dispatch-loader.js');
    vi.mocked(loader.loadDispatchPlugin).mockResolvedValueOnce(null);
    const { runDispatchStatus } = await import('./dispatch.js');
    await expect(runDispatchStatus()).rejects.toMatchObject({
      code: 'DISPATCH_UNAVAILABLE',
    });
  });
});

describe('runDispatchUp', () => {
  it('invokes the centralized runInherit helper, not child_process directly', async () => {
    const exec = await import('../shell/exec.js');
    vi.mocked(exec.runInherit).mockResolvedValueOnce(0);
    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    const { runDispatchUp } = await import('./dispatch.js');
    await runDispatchUp();

    expect(exec.runInherit).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['hub', 'start']),
      expect.objectContaining({
        env: expect.objectContaining({ DISPATCH_PILOT_HOST: '1' }),
      })
    );
    expect(process.exitCode).toBe(0);
    process.exitCode = prevExitCode;
  });

  it('propagates the child exit code to process.exitCode', async () => {
    const exec = await import('../shell/exec.js');
    vi.mocked(exec.runInherit).mockResolvedValueOnce(42);
    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    const { runDispatchUp } = await import('./dispatch.js');
    await runDispatchUp();

    expect(process.exitCode).toBe(42);
    process.exitCode = prevExitCode;
  });
});

describe('runDispatchDown', () => {
  it('throws PilotError DISPATCH_NOT_READY (no console.log, no leaked plan numbering)', async () => {
    const { runDispatchDown } = await import('./dispatch.js');
    await expect(runDispatchDown()).rejects.toMatchObject({
      code: 'DISPATCH_NOT_READY',
    });
    // Must not have leaked anything to stdout/stderr (the user-facing message
    // is formatted by the top-level error handler, not by this function).
    expect(stdout).toBe('');
  });
});

describe('runDispatchPassthrough', () => {
  it('forwards args to the dispatch CLI via runInherit', async () => {
    const exec = await import('../shell/exec.js');
    vi.mocked(exec.runInherit).mockResolvedValueOnce(0);
    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    const { runDispatchPassthrough } = await import('./dispatch.js');
    await runDispatchPassthrough(['worker', 'register', '--name', 'mac']);

    expect(exec.runInherit).toHaveBeenCalledWith(
      'npx',
      ['-y', '@medalsocial/dispatch', 'worker', 'register', '--name', 'mac'],
      expect.objectContaining({
        env: expect.objectContaining({ DISPATCH_PILOT_HOST: '1' }),
      })
    );
    expect(process.exitCode).toBe(0);
    process.exitCode = prevExitCode;
  });

  it('propagates non-zero exit code from the passthrough child', async () => {
    const exec = await import('../shell/exec.js');
    vi.mocked(exec.runInherit).mockResolvedValueOnce(2);
    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    const { runDispatchPassthrough } = await import('./dispatch.js');
    await runDispatchPassthrough(['source', 'list']);

    expect(process.exitCode).toBe(2);
    process.exitCode = prevExitCode;
  });
});
