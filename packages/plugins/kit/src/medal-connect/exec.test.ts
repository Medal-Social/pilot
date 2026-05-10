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
    applyPatch: vi.fn(async () => [] as readonly string[]),
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

describe('execKit kit.apply-patch-and-rebuild', () => {
  it('applies patch, commits + pushes mutated paths, runs rebuild, persists last rebuild', async () => {
    const applyPatch = vi.fn(async () => ['machines/host.apps.json'] as readonly string[]);
    const deps = makeDeps({ applyPatch });
    const cmd = {
      kind: 'kit.apply-patch-and-rebuild',
      args: {
        patch: { ops: [{ kind: 'cask.add', cask: 'spotify' }] },
        message: 'connect: add spotify',
      },
    };
    const r = await execKit(cmd, ctx(), deps);
    expect(r.status).toBe('ok');
    expect(applyPatch).toHaveBeenCalledWith('/tmp/kit', cmd.args.patch);
    // commitAndPush MUST receive the mutated paths so raw.write outputs are
    // never left unstaged (Codex P1 + Qodo P0 sweep #1).
    expect(deps.commitAndPush).toHaveBeenCalledWith('connect: add spotify', [
      'machines/host.apps.json',
    ]);
    expect(deps.runRebuild).toHaveBeenCalledOnce();
    expect(deps.persistLastRebuild).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it('passes raw.write paths through to commitAndPush so they get staged', async () => {
    const applyPatch = vi.fn(
      async () => ['machines/host.apps.json', 'modules/x.nix'] as readonly string[]
    );
    const deps = makeDeps({ applyPatch });
    const r = await execKit(
      {
        kind: 'kit.apply-patch-and-rebuild',
        args: {
          patch: {
            ops: [
              { kind: 'cask.add', cask: 'spotify' },
              { kind: 'raw.write', path: 'modules/x.nix', content: '{}' },
            ],
          },
          message: 'connect: change',
        },
      },
      ctx(),
      deps
    );
    expect(r.status).toBe('ok');
    expect(deps.commitAndPush).toHaveBeenCalledWith('connect: change', [
      'machines/host.apps.json',
      'modules/x.nix',
    ]);
  });

  it('returns failed if applyPatch throws (no commit, no rebuild)', async () => {
    const applyPatch = vi.fn(async () => {
      throw new Error('Medal Connect cannot edit secrets paths: secrets/x');
    });
    const deps = makeDeps({ applyPatch });
    const r = await execKit(
      {
        kind: 'kit.apply-patch-and-rebuild',
        args: { patch: { ops: [] }, message: 'm' },
      },
      ctx(),
      deps
    );
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toMatch(/secrets/);
    expect(deps.commitAndPush).not.toHaveBeenCalled();
    expect(deps.runRebuild).not.toHaveBeenCalled();
  });

  it('returns failed if rebuild fails (but patch + commit already landed)', async () => {
    const runRebuild = vi.fn(async () => ({
      ok: false,
      durationMs: 100,
      error: 'derivation broke',
    }));
    const deps = makeDeps({ runRebuild });
    const r = await execKit(
      {
        kind: 'kit.apply-patch-and-rebuild',
        args: { patch: { ops: [] }, message: 'm' },
      },
      ctx(),
      deps
    );
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toMatch(/derivation broke/);
    expect(deps.commitAndPush).toHaveBeenCalled();
    expect(deps.runRebuild).toHaveBeenCalled();
    expect(deps.persistLastRebuild).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it('returns failed if rebuild throws', async () => {
    const runRebuild = vi.fn(async () => {
      throw new Error('rebuild crashed');
    });
    const deps = makeDeps({ runRebuild });
    const r = await execKit(
      {
        kind: 'kit.apply-patch-and-rebuild',
        args: { patch: { ops: [] }, message: 'm' },
      },
      ctx(),
      deps
    );
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toMatch(/rebuild crashed/);
    expect(deps.persistLastRebuild).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it('rejects when patch arg is missing', async () => {
    const deps = makeDeps();
    const r = await execKit(
      { kind: 'kit.apply-patch-and-rebuild', args: { message: 'm' } },
      ctx(),
      deps
    );
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toMatch(/missing.*patch/i);
    expect(deps.applyPatch).not.toHaveBeenCalled();
  });

  it('rejects when patch.ops is not an array', async () => {
    const deps = makeDeps();
    const r = await execKit(
      {
        kind: 'kit.apply-patch-and-rebuild',
        args: { patch: { ops: 'not-an-array' }, message: 'm' },
      },
      ctx(),
      deps
    );
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toMatch(/patch/i);
  });

  it('rejects when message arg is missing', async () => {
    const deps = makeDeps();
    const r = await execKit(
      {
        kind: 'kit.apply-patch-and-rebuild',
        args: { patch: { ops: [] } },
      },
      ctx(),
      deps
    );
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error).toMatch(/message/i);
    expect(deps.applyPatch).not.toHaveBeenCalled();
  });
});
