// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snapshot } from './snapshot.js';

let dir: string;

function gitInit(d: string) {
  execSync('git init -q -b main', { cwd: d });
  execSync('git config user.email t@t', { cwd: d });
  execSync('git config user.name t', { cwd: d });
  writeFileSync(join(d, 'README'), '# kit\n');
  execSync('git add . && git commit -q -m init', { cwd: d });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-snap-'));
  gitInit(dir);
  // Canonical kit layout: machines/<machineId>.apps.json. The default test
  // machineId is 'test' (matches the `machineId` arg used in the assertions
  // below), so seed the file at that path.
  mkdirSync(join(dir, 'machines'));
  writeFileSync(
    join(dir, 'machines', 'test.apps.json'),
    JSON.stringify({ casks: ['spotify', 'figma'], brews: [] })
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('kit snapshot', () => {
  it('returns the canonical KitStateSnapshot shape', async () => {
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'test',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s).toMatchObject({
      profile: 'workstation',
      apps: ['figma', 'spotify'], // sorted
      ahead: 0,
      behind: 0,
    });
    expect(s.kitRepoHead).toMatch(/^[0-9a-f]{40}$/);
  });

  it('reports profile=server when machineType is nixos', async () => {
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'oslo',
      user: 'ali',
      machineType: 'nixos',
    });
    expect(s.profile).toBe('server');
  });

  it('reports apps=[] when no machine apps file or legacy file exists', async () => {
    rmSync(join(dir, 'machines', 'test.apps.json'));
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 't',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.apps).toEqual([]);
  });

  it('falls back to the legacy apps/apps.json when no machine file exists', async () => {
    rmSync(join(dir, 'machines', 'test.apps.json'));
    mkdirSync(join(dir, 'apps'));
    writeFileSync(
      join(dir, 'apps', 'apps.json'),
      JSON.stringify({ casks: ['legacy-app'], brews: [] })
    );
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'unknown-machine',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.apps).toEqual(['legacy-app']);
  });

  it('reports kitRepoHead=null and apps=[] when kitRepoDir is not a git repo', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'mc-snap-empty-'));
    try {
      const s = await snapshot({
        kitRepoDir: empty,
        machineId: 't',
        user: 'u',
        machineType: 'darwin',
      });
      expect(s.kitRepoHead).toBe(null);
      expect(s.apps).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('returns apps=[] when apps.json is malformed JSON', async () => {
    writeFileSync(join(dir, 'machines', 'test.apps.json'), '{ not valid json');
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'test',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.apps).toEqual([]);
  });

  it('returns apps=[] when apps.json has casks: not-an-array', async () => {
    writeFileSync(
      join(dir, 'machines', 'test.apps.json'),
      JSON.stringify({ casks: 'a-string', brews: [] })
    );
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'test',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.apps).toEqual([]);
  });

  it('filters non-string entries from casks', async () => {
    writeFileSync(
      join(dir, 'machines', 'test.apps.json'),
      JSON.stringify({ casks: ['valid', 123, null, { x: 1 }, 'also-valid'], brews: [] })
    );
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'test',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.apps).toEqual(['also-valid', 'valid']);
  });

  it('returns minimal profile when machineType is unknown', async () => {
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'test',
      user: 'u',
      machineType: 'freebsd',
    });
    expect(s.profile).toBe('minimal');
  });

  it('ignores malformed last-rebuild.json', async () => {
    const stateDir = join(dir, '.medal-connect');
    mkdirSync(stateDir);
    writeFileSync(join(stateDir, 'last-rebuild.json'), 'not json');
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'test',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.lastRebuildAt).toBeUndefined();
    expect(s.lastRebuildOk).toBeUndefined();
  });

  it('ignores last-rebuild.json fields with wrong types', async () => {
    const stateDir = join(dir, '.medal-connect');
    mkdirSync(stateDir);
    writeFileSync(
      join(stateDir, 'last-rebuild.json'),
      JSON.stringify({ at: 'not-a-number', ok: 'not-a-bool' })
    );
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 'test',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.lastRebuildAt).toBeUndefined();
    expect(s.lastRebuildOk).toBeUndefined();
  });

  it('round-trips lastRebuildAt + lastRebuildOk from a state file', async () => {
    const stateDir = join(dir, '.medal-connect');
    mkdirSync(stateDir);
    writeFileSync(
      join(stateDir, 'last-rebuild.json'),
      JSON.stringify({ at: 1715000000000, ok: true })
    );
    const s = await snapshot({
      kitRepoDir: dir,
      machineId: 't',
      user: 'u',
      machineType: 'darwin',
    });
    expect(s.lastRebuildAt).toBe(1715000000000);
    expect(s.lastRebuildOk).toBe(true);
  });
});
