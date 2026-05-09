// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initSteps, runInit } from './init.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('initSteps', () => {
  it('skips xcode + rosetta on linux', () => {
    const steps = initSteps({ platform: 'linux', arch: 'x64' });
    const ids = steps.map((s) => s.id);
    expect(ids).not.toContain('xcode');
    expect(ids).not.toContain('rosetta');
    expect(ids).toContain('nix');
  });

  it('includes xcode but not rosetta on darwin x64', () => {
    const ids = initSteps({ platform: 'darwin', arch: 'x64' }).map((s) => s.id);
    expect(ids).toContain('xcode');
    expect(ids).not.toContain('rosetta');
  });

  it('includes rosetta on darwin arm64', () => {
    const ids = initSteps({ platform: 'darwin', arch: 'arm64' }).map((s) => s.id);
    expect(ids).toContain('rosetta');
  });

  it('always ends with rebuild', () => {
    const steps = initSteps({ platform: 'darwin', arch: 'arm64' });
    expect(steps[steps.length - 1].id).toBe('rebuild');
  });

  it('runs init steps and reports status to the provider', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kit-init-'));
    roots.push(root);
    mkdirSync(join(root, '.git'), { recursive: true });
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd === 'ssh')
          return { stdout: '', stderr: 'Hi! You have successfully authenticated', code: 1 };
        return { stdout: 'ok', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const provider = {
      id: 'test',
      displayName: 'Test',
      getRequiredApps: vi.fn(),
      getRequiredPlugins: vi.fn(),
      getSecurityBaseline: vi.fn(),
      reportStatus: vi.fn().mockResolvedValue(undefined),
    };

    await runInit({
      machine: 'ali-pro',
      machineType: 'nixos',
      kitRepoDir: root,
      kitRepoUrl: 'git@github.com:medal-social/kit.git',
      provider,
      exec,
      platform: 'linux',
      arch: 'x64',
      user: 'ali',
    });

    expect(provider.reportStatus).toHaveBeenCalledWith(
      { machineId: 'ali-pro', user: 'ali', kitRepoDir: root },
      { machineId: 'ali-pro', os: 'linux', arch: 'x64', kitCommit: null, appsCount: 0 }
    );
    expect(exec.run).toHaveBeenCalledWith(
      'sudo',
      ['nixos-rebuild', 'switch', '--flake', '.#ali-pro'],
      { cwd: root }
    );
  });
});
