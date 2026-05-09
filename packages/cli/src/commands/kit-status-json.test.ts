// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runKitStatus } from './kit.js';

describe('runKitStatus --json on missing config', () => {
  let stdout: string;
  let stderr: string;
  let exitCode: number | undefined;
  let origStdoutWrite: typeof process.stdout.write;
  let origStderrWrite: typeof process.stderr.write;
  let origExit: typeof process.exit;
  let origKitConfig: string | undefined;
  let origIsTTY: boolean | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = '';
    stderr = '';
    exitCode = undefined;
    origStdoutWrite = process.stdout.write.bind(process.stdout);
    origStderrWrite = process.stderr.write.bind(process.stderr);
    origExit = process.exit;
    origKitConfig = process.env.KIT_CONFIG;
    origIsTTY = process.stdout.isTTY;

    process.stdout.write = ((s: string | Uint8Array) => {
      stdout += typeof s === 'string' ? s : Buffer.from(s).toString('utf8');
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((s: string | Uint8Array) => {
      stderr += typeof s === 'string' ? s : Buffer.from(s).toString('utf8');
      return true;
    }) as typeof process.stderr.write;
    // fail() in kit.ts uses console.error, which vitest intercepts before our
    // process.stderr.write override sees it. Capture it explicitly so the
    // stderr assertions reflect what the user actually sees.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr += `${args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')}\n`;
    });
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`__exit_${exitCode}__`);
    }) as typeof process.exit;

    // Force the loader to fail with KIT_CONFIG_NOT_FOUND.
    process.env.KIT_CONFIG = '/tmp/definitely-not-a-real-kit-config.json';
  });

  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
    consoleErrorSpy.mockRestore();
    if (origKitConfig === undefined) delete process.env.KIT_CONFIG;
    else process.env.KIT_CONFIG = origKitConfig;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: origIsTTY });
  });

  it('emits structured JSON to stdout, nothing to stderr, sets exitCode 1', async () => {
    // Returns normally (no throw) so stdout has time to flush before exit.
    // The earlier process.exit(1) caused piped consumers to see truncated JSON.
    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    await expect(runKitStatus({ json: true })).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(stderr).toBe('');
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: false,
      error: 'kit_config_not_found',
    });
    expect(typeof parsed.message).toBe('string');
    expect(Array.isArray(parsed.searched)).toBe(true);
    expect(parsed.searched.length).toBeGreaterThan(0);

    process.exitCode = prevExitCode;
  });

  it('emits JSON envelope when stdout is piped even without --json', async () => {
    // Mirrors the success-path auto-detection (`!process.stdout.isTTY` ⇒ JSON).
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    await expect(runKitStatus({ json: false })).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(stderr).toBe('');
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({ ok: false, error: 'kit_config_not_found' });

    process.exitCode = prevExitCode;
  });

  it('TTY path (no --json, real terminal) still writes to stderr and exits 1', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });

    await expect(runKitStatus({ json: false })).rejects.toThrow(/__exit_1__/);

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('No kit.config.json found');
  });
});
