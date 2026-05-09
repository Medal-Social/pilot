// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { runConformanceSuite } from './conformance.js';
import { LocalProvider } from './local.js';

describe('LocalProvider conformance', () => {
  it('passes the FleetProvider conformance suite', async () => {
    await runConformanceSuite(new LocalProvider());
  });

  it('disposes provider subscriptions when present', async () => {
    const dispose = vi.fn();
    const provider = {
      id: 'subscribed',
      displayName: 'Subscribed Provider',
      getRequiredApps: vi.fn().mockResolvedValue({ casks: [], brews: [], source: 'test' }),
      getRequiredPlugins: vi.fn().mockResolvedValue({ plugins: [], source: 'test' }),
      getSecurityBaseline: vi.fn().mockResolvedValue([]),
      reportStatus: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((_ctx, handler: (event: { type: string; payload: unknown }) => void) => {
        handler({ type: 'ready', payload: null });
        return { dispose };
      }),
    };

    await runConformanceSuite(provider);

    expect(provider.subscribe).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});
