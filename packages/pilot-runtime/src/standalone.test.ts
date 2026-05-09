// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { makeStandaloneHost } from './standalone.js';

describe('makeStandaloneHost', () => {
  it('cloud.send is a no-op that resolves and logs', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const host = makeStandaloneHost({ log });
    await expect(
      host.cloud.send({
        plugin: '@medalsocial/dispatch',
        id: 'evt-1',
        ts: 1,
        kind: 'task.created',
        deviceId: 'd1',
        payload: {},
      })
    ).resolves.toBeUndefined();
    expect(log.debug).toHaveBeenCalledWith(
      'pilot.cloud.send (standalone — no-op)',
      expect.objectContaining({ plugin: '@medalsocial/dispatch', kind: 'task.created' })
    );
  });

  it('email.send returns a fake id and logs to/subject', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const host = makeStandaloneHost({ log });
    const r = await host.email.send({
      to: 'x@example.com',
      subject: 'hi',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(r.id).toMatch(/^standalone-/);
    expect(log.info).toHaveBeenCalledWith(
      'pilot.email.send (standalone)',
      expect.objectContaining({ to: 'x@example.com', subject: 'hi' })
    );
  });

  it('secrets.get reads from the supplied env map', async () => {
    const host = makeStandaloneHost({ env: { medal_workspace_api_key: 'xyz' } });
    expect(await host.secrets.get('medal_workspace_api_key')).toBe('xyz');
    expect(await host.secrets.get('missing')).toBeNull();
  });

  it('auth.medalSocial returns null', () => {
    const host = makeStandaloneHost();
    expect(host.auth.medalSocial()).toBeNull();
  });

  it('log defaults to a console-backed logger', () => {
    const host = makeStandaloneHost();
    expect(typeof host.log.info).toBe('function');
  });
});
