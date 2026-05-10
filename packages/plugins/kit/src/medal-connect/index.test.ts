// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { createKitProvider } from './index.js';

describe('createKitProvider', () => {
  it('returns a provider with id "kit" and capabilities for rebuild + cask.add + cask.remove', () => {
    const p = createKitProvider({
      kitRepoDir: '/tmp',
      machineId: 'm',
      user: 'u',
      machineType: 'darwin',
      runRebuild: async () => ({ ok: true, durationMs: 1 }),
      addCask: async () => undefined,
      removeCask: async () => undefined,
      commitAndPush: async () => undefined,
    });
    expect(p.id).toBe('kit');
    const caps = p.capabilities();
    const verbs = caps.map((c) => c.verb).sort();
    expect(verbs).toEqual(['cask.add', 'cask.remove', 'rebuild']);
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
    });
    const r = await p.exec({ kind: 'kit.rebuild', args: {} });
    expect(r.status).toBe('ok');
    expect(runRebuild).toHaveBeenCalledOnce();
  });
});
