// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { loadDispatchPlugin } from './dispatch-loader.js';

describe('loadDispatchPlugin', () => {
  it('imports @medalsocial/dispatch/plugin and returns the factory', async () => {
    const fakeImport = vi.fn(async () => ({
      default: (opts: unknown) => ({
        manifest: {
          name: 'dispatch',
          namespace: 'medalsocial',
          provides: { commands: [] as string[] },
        },
        syncStream: () => (async function* () {})(),
        applyRemote: async () => {},
        health: async () => ({ ok: true, details: { opts } }),
      }),
    }));
    const plugin = await loadDispatchPlugin({
      importFn: fakeImport as never,
      opts: { db: {}, feed: {}, deviceId: 'd1' } as never,
    });
    expect(fakeImport).toHaveBeenCalledWith('@medalsocial/dispatch/plugin');
    expect(plugin).not.toBeNull();
    expect(plugin?.manifest.name).toBe('dispatch');
  });

  it('returns null when the package is not installed', async () => {
    const plugin = await loadDispatchPlugin({
      importFn: async () => {
        throw Object.assign(new Error('not found'), { code: 'ERR_MODULE_NOT_FOUND' });
      },
      opts: {} as never,
    });
    expect(plugin).toBeNull();
  });
});
