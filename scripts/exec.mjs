/*
 * Copyright (c) Medal Social, Inc. and its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0.
 */

/**
 * Centralised subprocess execution wrapper for repo-local Node scripts.
 *
 * Mirrors the spirit of the CLI's `Exec` interface (see
 * `packages/cli/src/shell/exec.ts`): one place that touches `node:child_process`,
 * so call sites stay testable and auditable. Scripts under `scripts/` must
 * import from here rather than calling `execFileSync` directly.
 *
 * This module is intentionally tiny — it is used by build-time tooling only
 * and must have zero dependencies beyond Node built-ins.
 */

import { execFileSync } from 'node:child_process';

/**
 * Runs a command synchronously and returns its stdout, trimmed.
 *
 * @param {string} cmd - Executable name or path.
 * @param {ReadonlyArray<string>} args - Arguments (passed via `execFileSync`, no shell).
 * @param {object} [opts]
 * @param {boolean} [opts.tolerant=false] - When true, returns `null` on non-zero exit or spawn error instead of throwing.
 * @param {string} [opts.cwd] - Working directory.
 * @param {NodeJS.ProcessEnv} [opts.env] - Environment overrides.
 * @param {'pipe' | 'inherit'} [opts.stdio='pipe'] - Output handling for the child process.
 * @param {number} [opts.maxBuffer] - Override default stdout buffer size.
 * @returns {string | null} Trimmed stdout, or `null` when `tolerant` is set and the command failed.
 */
export function exec(cmd, args, opts = {}) {
  const { tolerant = false, cwd, env, maxBuffer, stdio = 'pipe' } = opts;
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      env,
      maxBuffer,
      stdio,
      encoding: stdio === 'pipe' ? 'utf8' : undefined,
    });
    return typeof stdout === 'string' ? stdout.trim() : '';
  } catch (error) {
    if (tolerant) return null;
    throw error;
  }
}
