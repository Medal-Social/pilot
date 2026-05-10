// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import type { WSClientOptions } from '../medal-connect/ws-client.js';
import { runConnectCommand } from './connect.js';

vi.mock('../medal-connect/keychain.js', () => ({
  loadDeviceToken: vi.fn(() => ({
    deviceId: 'd-x',
    workspaceId: 'ws-x',
    doUrl: 'http://do',
    token: 'tok',
  })),
}));

class MockWSClient {
  static instances: MockWSClient[] = [];
  started = false;
  closed = false;
  constructor(public opts: WSClientOptions) {
    MockWSClient.instances.push(this);
  }
  start(): void {
    this.started = true;
    this.opts.onConnect?.();
  }
  send(): boolean {
    return true;
  }
  close(): void {
    this.closed = true;
  }
}

class MockHeartbeatLoop {
  static instances: MockHeartbeatLoop[] = [];
  started = false;
  stopped = false;
  constructor(public client: { send: (frame: unknown) => boolean }) {
    MockHeartbeatLoop.instances.push(this);
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

type PairFlowOpts = Parameters<typeof import('../medal-connect/pair-flow.js').runPairFlow>[0];

describe('runConnectCommand', () => {
  it('runs pair flow and starts WS + heartbeat', async () => {
    MockWSClient.instances = [];
    MockHeartbeatLoop.instances = [];

    const stdout = vi.fn();
    const onCodeCalls: Array<[string, string]> = [];

    const fakePairFlow = vi.fn(async (opts: PairFlowOpts) => {
      opts.onCode?.('123456', 'http://medal.social/connect/123456');
      onCodeCalls.push(['123456', 'http://medal.social/connect/123456']);
      return { deviceId: 'd-x', workspaceId: 'ws-x', doUrl: 'http://do' };
    });

    await runConnectCommand({
      headless: true,
      _runPairFlow: fakePairFlow,
      _WSClient: MockWSClient as unknown as typeof import('../medal-connect/ws-client.js').WSClient,
      _HeartbeatLoop:
        MockHeartbeatLoop as unknown as typeof import('../medal-connect/heartbeat.js').HeartbeatLoop,
      _stdout: stdout,
    });

    expect(fakePairFlow).toHaveBeenCalledOnce();
    expect(onCodeCalls[0]).toEqual(['123456', 'http://medal.social/connect/123456']);

    const written = stdout.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('123-456');
    expect(written).toContain('http://medal.social/connect/123456');
    expect(written).toContain('Connected as d-x');

    // WS started with correct url + deviceId
    expect(MockWSClient.instances).toHaveLength(1);
    expect(MockWSClient.instances[0].opts.url).toBe('ws://do/ws/ws-x');
    expect(MockWSClient.instances[0].opts.deviceId).toBe('d-x');
    expect(MockWSClient.instances[0].opts.token).toBe('tok');
    expect(MockWSClient.instances[0].started).toBe(true);

    // Heartbeat started
    expect(MockHeartbeatLoop.instances).toHaveLength(1);
    expect(MockHeartbeatLoop.instances[0].started).toBe(true);
  });

  it('formats code as 3-3 digit groups', async () => {
    MockWSClient.instances = [];
    MockHeartbeatLoop.instances = [];

    const stdout = vi.fn();
    const fakePairFlow = vi.fn(async (opts: PairFlowOpts) => {
      opts.onCode?.('500005', 'url');
      return { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' };
    });
    await runConnectCommand({
      headless: true,
      _runPairFlow: fakePairFlow,
      _WSClient: MockWSClient as unknown as typeof import('../medal-connect/ws-client.js').WSClient,
      _HeartbeatLoop:
        MockHeartbeatLoop as unknown as typeof import('../medal-connect/heartbeat.js').HeartbeatLoop,
      _stdout: stdout,
    });
    expect(stdout.mock.calls.map((c) => c[0]).join('')).toContain('500-005');
  });

  it('does not call open when --headless', async () => {
    MockWSClient.instances = [];
    MockHeartbeatLoop.instances = [];

    const stdout = vi.fn();
    const fakeOpen = vi.fn(async () => undefined);
    const fakePairFlow = vi.fn(async (opts: PairFlowOpts) => {
      opts.onCode?.('111111', 'http://example/connect/111111');
      return { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' };
    });
    await runConnectCommand({
      headless: true,
      _runPairFlow: fakePairFlow,
      _WSClient: MockWSClient as unknown as typeof import('../medal-connect/ws-client.js').WSClient,
      _HeartbeatLoop:
        MockHeartbeatLoop as unknown as typeof import('../medal-connect/heartbeat.js').HeartbeatLoop,
      _open: fakeOpen,
      _stdout: stdout,
    });
    expect(fakeOpen).not.toHaveBeenCalled();
  });

  it('calls open when not headless', async () => {
    MockWSClient.instances = [];
    MockHeartbeatLoop.instances = [];

    const stdout = vi.fn();
    const fakeOpen = vi.fn(async () => undefined);
    const fakePairFlow = vi.fn(async (opts: PairFlowOpts) => {
      opts.onCode?.('111111', 'http://example/connect/111111');
      return { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' };
    });
    await runConnectCommand({
      _runPairFlow: fakePairFlow,
      _WSClient: MockWSClient as unknown as typeof import('../medal-connect/ws-client.js').WSClient,
      _HeartbeatLoop:
        MockHeartbeatLoop as unknown as typeof import('../medal-connect/heartbeat.js').HeartbeatLoop,
      _open: fakeOpen,
      _stdout: stdout,
    });
    // Wait a tick for the floating promise inside onCode
    await new Promise((r) => setImmediate(r));
    expect(fakeOpen).toHaveBeenCalledWith('http://example/connect/111111');
  });

  it('throws when keychain has no record after pair (sanity check)', async () => {
    MockWSClient.instances = [];
    MockHeartbeatLoop.instances = [];

    // Override keychain mock for this single test
    const { loadDeviceToken } = await import('../medal-connect/keychain.js');
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockImplementationOnce(() => null);

    const stdout = vi.fn();
    const fakePairFlow = vi.fn(async () => ({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'http://do',
    }));
    await expect(
      runConnectCommand({
        headless: true,
        _runPairFlow: fakePairFlow,
        _WSClient:
          MockWSClient as unknown as typeof import('../medal-connect/ws-client.js').WSClient,
        _HeartbeatLoop:
          MockHeartbeatLoop as unknown as typeof import('../medal-connect/heartbeat.js').HeartbeatLoop,
        _stdout: stdout,
      })
    ).rejects.toThrow(/keychain_lost_token/);
  });

  it('translates http:// doUrl to ws:// for WSClient', async () => {
    MockWSClient.instances = [];
    MockHeartbeatLoop.instances = [];

    const stdout = vi.fn();
    const fakePairFlow = vi.fn(async () => ({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'https://medal-connect.medal.social',
    }));
    await runConnectCommand({
      headless: true,
      _runPairFlow: fakePairFlow,
      _WSClient: MockWSClient as unknown as typeof import('../medal-connect/ws-client.js').WSClient,
      _HeartbeatLoop:
        MockHeartbeatLoop as unknown as typeof import('../medal-connect/heartbeat.js').HeartbeatLoop,
      _stdout: stdout,
    });
    expect(MockWSClient.instances[0].opts.url).toBe('wss://medal-connect.medal.social/ws/w');
  });
});
