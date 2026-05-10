// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readGitState } from './git.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-git-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@t', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  writeFileSync(join(dir, 'a'), 'a');
  execSync('git add . && git commit -q -m init', { cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readGitState', () => {
  it('returns head sha + ahead 0 + behind 0 for repo with no upstream', async () => {
    const r = await readGitState(dir);
    expect(r.kitRepoHead).toMatch(/^[0-9a-f]{40}$/);
    expect(r.ahead).toBe(0);
    expect(r.behind).toBe(0);
  });

  it('returns ahead = N when local has N commits beyond upstream', async () => {
    execSync('git checkout -q -b copy && git checkout -q main', { cwd: dir });
    execSync('git branch --set-upstream-to=copy main', { cwd: dir });
    writeFileSync(join(dir, 'b'), 'b');
    execSync('git add . && git commit -q -m 2', { cwd: dir });
    writeFileSync(join(dir, 'c'), 'c');
    execSync('git add . && git commit -q -m 3', { cwd: dir });
    const r = await readGitState(dir);
    expect(r.ahead).toBe(2);
    expect(r.behind).toBe(0);
  });

  it('returns behind = N when upstream has N commits beyond local', async () => {
    execSync('git checkout -q -b upstream', { cwd: dir });
    writeFileSync(join(dir, 'd'), 'd');
    execSync('git add . && git commit -q -m d', { cwd: dir });
    execSync('git checkout -q main', { cwd: dir });
    execSync('git branch --set-upstream-to=upstream main', { cwd: dir });
    const r = await readGitState(dir);
    expect(r.ahead).toBe(0);
    expect(r.behind).toBe(1);
  });

  it('returns null head when the runner reports spawn_failed', async () => {
    // Inject a runner that simulates the spawn error path on the first call
    // (rev-parse HEAD).
    const runner = async () => ({ code: 1, stdout: '', stderr: 'spawn_failed' });
    const r = await readGitState(dir, runner);
    expect(r.kitRepoHead).toBe(null);
    expect(r.ahead).toBe(0);
    expect(r.behind).toBe(0);
  });

  it('handles non-numeric ahead/behind output gracefully', async () => {
    // First call returns a sha; second call returns nonsense.
    let callCount = 0;
    const runner = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          code: 0,
          stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          stderr: '',
        };
      }
      return { code: 0, stdout: 'NaN garbage', stderr: '' };
    };
    const r = await readGitState(dir, runner);
    expect(r.kitRepoHead).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(r.ahead).toBe(0);
    expect(r.behind).toBe(0);
  });

  it('returns null head when path is not a git repo', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'mc-git-empty-'));
    try {
      const r = await readGitState(empty);
      expect(r.kitRepoHead).toBe(null);
      expect(r.ahead).toBe(0);
      expect(r.behind).toBe(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
