// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { loadDispatchPlugin } from '../../packages/cli/src/plugins/dispatch-loader.js';

describe('loadDispatchPlugin (integration)', () => {
  it('loads a package whose default export is the plugin factory', async () => {
    const fakePackage = {
      default: (opts: { deviceId: string }) => ({
        manifest: {
          name: 'dispatch',
          namespace: 'medalsocial',
          provides: { commands: [] as string[] },
        },
        syncStream: () => (async function* () {})(),
        applyRemote: async () => {},
        health: async () => ({ ok: true, details: { deviceId: opts.deviceId } }),
      }),
    };
    const plugin = await loadDispatchPlugin({
      importFn: async () => fakePackage as never,
      opts: { deviceId: 'integ-1' },
    });
    expect(plugin).not.toBeNull();
    const h = await plugin?.health();
    expect(h?.details).toMatchObject({ deviceId: 'integ-1' });
  });
});
