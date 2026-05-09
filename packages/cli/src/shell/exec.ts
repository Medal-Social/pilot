// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// This is the single authoritative place for subprocess execution in the CLI package.
// All child_process usage must go through this interface — never import child_process
// directly elsewhere.

import { spawn } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface Exec {
  run(
    cmd: string,
    args: string[],
    opts?: { cwd?: string; env?: NodeJS.ProcessEnv }
  ): Promise<ExecResult>;
}

export const realExec: Exec = {
  run(cmd, args, opts = {}) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (b: Buffer) => {
        stdout += b.toString();
      });
      child.stderr.on('data', (b: Buffer) => {
        stderr += b.toString();
      });
      child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      child.on('error', () => resolve({ stdout, stderr, code: 1 }));
    });
  },
};

/**
 * Run a command with stdio inherited from the parent process so the user can
 * see live output and the child can read stdin (interactive subprocesses,
 * passthrough to other CLIs, etc.). Returns the child's exit code.
 *
 * Kept here next to `realExec` so subprocess execution stays centralized in
 * one file — call sites elsewhere must import from this module rather than
 * reaching for `node:child_process` directly.
 */
export function runInherit(
  cmd: string,
  args: readonly string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });
}
