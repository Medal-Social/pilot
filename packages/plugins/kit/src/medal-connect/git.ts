// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';

export interface GitState {
  kitRepoHead: string | null; // null when not a git repo
  ahead: number;
  behind: number;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    child.on('error', () => resolve({ code: 1, stdout: '', stderr: 'spawn_failed' }));
  });
}

export async function readGitState(repoDir: string): Promise<GitState> {
  const head = await run('git', ['rev-parse', 'HEAD'], repoDir);
  if (head.code !== 0) {
    return { kitRepoHead: null, ahead: 0, behind: 0 };
  }
  const sha = head.stdout.trim();

  // ahead/behind requires an upstream; tolerate the no-upstream case as 0/0.
  const counts = await run(
    'git',
    ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
    repoDir
  );
  if (counts.code !== 0) {
    return { kitRepoHead: sha, ahead: 0, behind: 0 };
  }
  const parts = counts.stdout.trim().split(/\s+/);
  const behind = Number.parseInt(parts[0] ?? '0', 10);
  const ahead = Number.parseInt(parts[1] ?? '0', 10);
  return {
    kitRepoHead: sha,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}
