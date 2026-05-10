// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKitProvider } from './index.js';

describe('createKitProvider', () => {
  it('returns a provider with id "kit" and the v1 verb capabilities', () => {
    const p = createKitProvider({
      kitRepoDir: '/tmp',
      machineId: 'm',
      user: 'u',
      machineType: 'darwin',
      runRebuild: async () => ({ ok: true, durationMs: 1 }),
      addCask: async () => undefined,
      removeCask: async () => undefined,
      commitAndPush: async () => undefined,
      resolveAppsFile: () => '/tmp/apps.json',
    });
    expect(p.id).toBe('kit');
    const caps = p.capabilities();
    const verbs = caps.map((c) => c.verb).sort();
    expect(verbs).toEqual(['apply-patch-and-rebuild', 'cask.add', 'cask.remove', 'rebuild']);
  });

  it('exec routes kit.rebuild through to deps.runRebuild', async () => {
    const runRebuild = vi.fn(async () => ({ ok: true, durationMs: 5 }));
    const p = createKitProvider({
      kitRepoDir: '/tmp',
      machineId: 'm',
      user: 'u',
      machineType: 'darwin',
      runRebuild,
      addCask: async () => undefined,
      removeCask: async () => undefined,
      commitAndPush: async () => undefined,
      resolveAppsFile: () => '/tmp/apps.json',
    });
    const r = await p.exec({ kind: 'kit.rebuild', args: {} });
    expect(r.status).toBe('ok');
    expect(runRebuild).toHaveBeenCalledOnce();
  });

  describe('persistLastRebuild', () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'mc-prov-'));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it('writes .medal-connect/last-rebuild.json after a successful rebuild', async () => {
      const p = createKitProvider({
        kitRepoDir: tmp,
        machineId: 'm',
        user: 'u',
        machineType: 'darwin',
        runRebuild: async () => ({ ok: true, durationMs: 12 }),
        addCask: async () => undefined,
        removeCask: async () => undefined,
        commitAndPush: async () => undefined,
        resolveAppsFile: () => '/tmp/apps.json',
      });
      const r = await p.exec({ kind: 'kit.rebuild', args: {} });
      expect(r.status).toBe('ok');
      const target = join(tmp, '.medal-connect', 'last-rebuild.json');
      expect(existsSync(target)).toBe(true);
      const parsed = JSON.parse(readFileSync(target, 'utf8'));
      expect(parsed.ok).toBe(true);
      expect(parsed.at).toBeTypeOf('number');
    });

    it('still writes the marker on a failing rebuild (with ok=false)', async () => {
      const p = createKitProvider({
        kitRepoDir: tmp,
        machineId: 'm',
        user: 'u',
        machineType: 'darwin',
        runRebuild: async () => ({ ok: false, durationMs: 8, error: 'boom' }),
        addCask: async () => undefined,
        removeCask: async () => undefined,
        commitAndPush: async () => undefined,
        resolveAppsFile: () => '/tmp/apps.json',
      });
      const r = await p.exec({ kind: 'kit.rebuild', args: {} });
      expect(r.status).toBe('failed');
      const parsed = JSON.parse(
        readFileSync(join(tmp, '.medal-connect', 'last-rebuild.json'), 'utf8')
      );
      expect(parsed.ok).toBe(false);
    });
  });

  it('snapshot() returns a state object with the canonical KitStateSnapshot keys', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mc-prov-snap-'));
    try {
      const p = createKitProvider({
        kitRepoDir: tmp,
        machineId: 'no-such-machine',
        user: 'u',
        machineType: 'darwin',
        runRebuild: async () => ({ ok: true, durationMs: 1 }),
        addCask: async () => undefined,
        removeCask: async () => undefined,
        commitAndPush: async () => undefined,
        resolveAppsFile: () => '/tmp/apps.json',
      });
      const snap = await p.snapshot();
      expect(snap).toMatchObject({
        profile: 'workstation',
        kitRepoHead: null,
        ahead: 0,
        behind: 0,
        apps: [],
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('watch() returns a Disposable (smoke check; full coverage in watch tests)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mc-prov-watch-'));
    try {
      const p = createKitProvider({
        kitRepoDir: tmp,
        machineId: 'm',
        user: 'u',
        machineType: 'darwin',
        runRebuild: async () => ({ ok: true, durationMs: 1 }),
        addCask: async () => undefined,
        removeCask: async () => undefined,
        commitAndPush: async () => undefined,
        resolveAppsFile: () => '/tmp/apps.json',
      });
      const sub = p.watch(() => undefined);
      expect(typeof sub.dispose).toBe('function');
      sub.dispose();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
