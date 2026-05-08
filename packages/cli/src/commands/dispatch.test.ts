// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';

vi.mock('../plugins/dispatch-loader.js', () => ({
  loadDispatchPlugin: async () => ({
    manifest: { name: 'dispatch', namespace: 'medalsocial', provides: { commands: [] } },
    syncStream: () => (async function* () {})(),
    applyRemote: async () => {},
    health: async () => ({ ok: true, details: { migrationsApplied: true } }),
  }),
}));

describe('runDispatchStatus', () => {
  it('prints health JSON', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { runDispatchStatus } = await import('./dispatch.js');
    await runDispatchStatus();
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('migrationsApplied');
    log.mockRestore();
  });
});
