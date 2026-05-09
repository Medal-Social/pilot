// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { createDispatchHost } from './dispatch-host.js';

describe('createDispatchHost', () => {
  it('cloud.send logs and resolves', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const host = createDispatchHost({
      log,
      secretsStore: {},
      medalSocial: null,
      sendEmail: async () => ({ id: 'e' }),
    });
    await host.cloud.send({
      plugin: '@medalsocial/dispatch',
      id: 'e',
      ts: 0,
      kind: 'task.created',
      deviceId: 'd',
      payload: {},
    });
    expect(log.info).toHaveBeenCalledWith(
      'pilot.cloud.send',
      expect.objectContaining({ plugin: '@medalsocial/dispatch', kind: 'task.created' })
    );
  });

  it('email.send delegates to sendEmail', async () => {
    const sendEmail = vi.fn(async () => ({ id: 'real-id' }));
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const host = createDispatchHost({ log, secretsStore: {}, medalSocial: null, sendEmail });
    const r = await host.email.send({ to: 'x', subject: 's', html: '', text: '' });
    expect(r).toEqual({ id: 'real-id' });
    expect(sendEmail).toHaveBeenCalled();
  });

  it('secrets.get reads from store', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const host = createDispatchHost({
      log,
      secretsStore: { medal_workspace_api_key: 'wk_xxx' },
      medalSocial: null,
      sendEmail: async () => ({ id: '' }),
    });
    expect(await host.secrets.get('medal_workspace_api_key')).toBe('wk_xxx');
    expect(await host.secrets.get('missing')).toBeNull();
  });
});
