// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { type ExecDeps, execKit } from './exec.js';

function ctx() {
  return { kitRepoDir: '/tmp/kit', machineId: 'm', user: 'u', machineType: 'darwin' as const };
}

function makeDeps(over: Partial<ExecDeps> = {}): ExecDeps {
  return {
    runRebuild: vi.fn(async () => ({ ok: true, durationMs: 100 })),
    addCask: vi.fn(async () => undefined),
    removeCask: vi.fn(async () => undefined),
    persistLastRebuild: vi.fn(async () => undefined),
    commitAndPush: vi.fn(async () => undefined),
    ...over,
  };
}

describe('execKit', () => {
  it('routes kit.rebuild to runRebuild + persists last rebuild', async () => {
    const deps = makeDeps();
    const res = await execKit({ kind: 'kit.rebuild', args: {} }, ctx(), deps);
    expect(res.status).toBe('ok');
    expect(deps.runRebuild).toHaveBeenCalledOnce();
    expect(deps.persistLastRebuild).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it('returns failed when runRebuild rejects', async () => {
    const deps = makeDeps({
      runRebuild: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const res = await execKit({ kind: 'kit.rebuild', args: {} }, ctx(), deps);
    expect(res.status).toBe('failed');
    if (res.status === 'failed') expect(res.error).toMatch(/boom/);
    expect(deps.persistLastRebuild).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it('routes kit.cask.add to addCask + commitAndPush', async () => {
    const deps = makeDeps();
    const res = await execKit({ kind: 'kit.cask.add', args: { cask: 'spotify' } }, ctx(), deps);
    expect(res.status).toBe('ok');
    expect(deps.addCask).toHaveBeenCalledWith('spotify');
    expect(deps.commitAndPush).toHaveBeenCalledOnce();
  });

  it('rejects kit.cask.add without cask arg', async () => {
    const deps = makeDeps();
    const res = await execKit({ kind: 'kit.cask.add', args: {} }, ctx(), deps);
    expect(res.status).toBe('failed');
  });

  it('routes kit.cask.remove to removeCask + commitAndPush', async () => {
    const deps = makeDeps();
    const res = await execKit({ kind: 'kit.cask.remove', args: { cask: 'spotify' } }, ctx(), deps);
    expect(res.status).toBe('ok');
    expect(deps.removeCask).toHaveBeenCalledWith('spotify');
    expect(deps.commitAndPush).toHaveBeenCalledOnce();
  });

  it('rejects unknown kit verbs', async () => {
    const deps = makeDeps();
    const res = await execKit({ kind: 'kit.unsupported', args: {} }, ctx(), deps);
    expect(res.status).toBe('failed');
    if (res.status === 'failed') expect(res.error).toMatch(/unknown/i);
  });

  it('rejects non-kit kinds', async () => {
    const deps = makeDeps();
    const res = await execKit({ kind: 'dispatch.spawn', args: {} }, ctx(), deps);
    expect(res.status).toBe('failed');
    if (res.status === 'failed') expect(res.error).toMatch(/wrong provider/);
  });
});
