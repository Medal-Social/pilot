// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgentRuntime } from './agent-runtime.js';
import type { MedalConnectProvider } from './provider-types.js';

class MockClient {
  static instances: MockClient[] = [];
  sent: unknown[] = [];
  closed = false;
  onCommand?: (cmd: {
    type: 'command';
    commandId: string;
    kind: string;
    args: Record<string, unknown>;
  }) => void;
  constructor(public opts: { onCommand?: typeof MockClient.prototype.onCommand }) {
    this.onCommand = opts.onCommand;
    MockClient.instances.push(this);
  }
  start() {
    /* simulated */
  }
  send(frame: unknown) {
    this.sent.push(frame);
    return true;
  }
  close() {
    this.closed = true;
  }
}

class MockHB {
  static instances: MockHB[] = [];
  started = false;
  stopped = false;
  kicked = 0;
  constructor(_client: unknown) {
    MockHB.instances.push(this);
  }
  start() {
    this.started = true;
  }
  kick() {
    this.kicked += 1;
  }
  stop() {
    this.stopped = true;
  }
}

function makeProvider(over: Partial<MedalConnectProvider> = {}): MedalConnectProvider {
  return {
    id: 'kit',
    capabilities: () => [{ verb: 'rebuild' }],
    snapshot: vi.fn(async () => ({
      profile: 'workstation',
      kitRepoHead: 'abc',
      ahead: 0,
      behind: 0,
      apps: [],
    })),
    watch: vi.fn(() => ({ dispose: vi.fn() })),
    exec: vi.fn(async () => ({ status: 'ok', result: { durationMs: 1 } })),
    ...over,
  };
}

describe('runAgentRuntime', () => {
  beforeEach(() => {
    MockClient.instances = [];
    MockHB.instances = [];
  });

  it('emits a kit.state event on first connect from each provider snapshot', async () => {
    const provider = makeProvider();
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: MockClient as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    handle.onConnected();
    await new Promise((r) => setImmediate(r));
    const sent = MockClient.instances[0].sent.map((f) => f);
    const events = sent.filter(
      // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
      (f: any) => f.type === 'event' && f.kind === 'kit.state'
    );
    expect(events).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
    expect((events[0] as any).payload.kitRepoHead).toBe('abc');
    expect(provider.snapshot).toHaveBeenCalledOnce();
    handle.shutdown();
  });

  it('routes incoming command frames whose kind starts with "kit." to the kit provider', async () => {
    const provider = makeProvider();
    let onCommand:
      | ((c: {
          type: 'command';
          commandId: string;
          kind: string;
          args: Record<string, unknown>;
        }) => void)
      | undefined;
    const ClientCls = class {
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      static instances: any[] = [];
      sent: unknown[] = [];
      constructor(public opts: { onCommand: typeof onCommand }) {
        onCommand = opts.onCommand;
        ClientCls.instances.push(this);
      }
      start() {}
      send(f: unknown) {
        this.sent.push(f);
        return true;
      }
      close() {}
    };
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: ClientCls as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    onCommand?.({ type: 'command', commandId: 'c1', kind: 'kit.rebuild', args: {} });
    await new Promise((r) => setImmediate(r));
    expect(provider.exec).toHaveBeenCalledWith({ kind: 'kit.rebuild', args: {} });
    // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
    const sent = ClientCls.instances[0].sent as any[];
    // Acked
    const ack = sent.find((f) => f.type === 'command_ack');
    expect(ack).toMatchObject({ commandId: 'c1', received: true });
    // Result emitted
    const result = sent.find((f) => f.type === 'command_result');
    expect(result).toMatchObject({ commandId: 'c1', ok: true });
    handle.shutdown();
  });

  it('emits command_result with ok:false when provider exec returns failed', async () => {
    const provider = makeProvider({
      exec: vi.fn(async () => ({ status: 'failed', error: 'boom' })),
    });
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    let onCommand: any;
    const ClientCls = class {
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      static instances: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      sent: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      constructor(public opts: { onCommand: any }) {
        onCommand = opts.onCommand;
        ClientCls.instances.push(this);
      }
      start() {}
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      send(f: any) {
        this.sent.push(f);
        return true;
      }
      close() {}
    };
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: ClientCls as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    onCommand({ type: 'command', commandId: 'c1', kind: 'kit.rebuild', args: {} });
    await new Promise((r) => setImmediate(r));
    // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
    const sent = ClientCls.instances[0].sent as any[];
    const result = sent.find((f) => f.type === 'command_result');
    expect(result).toMatchObject({ commandId: 'c1', ok: false, error: 'boom' });
    handle.shutdown();
  });

  it('rejects commands for unknown providers with command_result ok:false', async () => {
    const provider = makeProvider();
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    let onCommand: any;
    const ClientCls = class {
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      static instances: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      sent: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      constructor(public opts: { onCommand: any }) {
        onCommand = opts.onCommand;
        ClientCls.instances.push(this);
      }
      start() {}
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      send(f: any) {
        this.sent.push(f);
        return true;
      }
      close() {}
    };
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: ClientCls as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    onCommand({ type: 'command', commandId: 'c1', kind: 'dispatch.spawn', args: {} });
    await new Promise((r) => setImmediate(r));
    // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
    const sent = ClientCls.instances[0].sent as any[];
    const result = sent.find((f) => f.type === 'command_result');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no provider/);
    expect(provider.exec).not.toHaveBeenCalled();
    handle.shutdown();
  });

  it('drains welcome.queuedCommands through the same provider router', async () => {
    const provider = makeProvider();
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    let onWelcome: any;
    const ClientCls = class {
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      static instances: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      sent: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      constructor(public opts: { onWelcome: any; onCommand: any }) {
        onWelcome = opts.onWelcome;
        ClientCls.instances.push(this);
      }
      start() {}
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      send(f: any) {
        this.sent.push(f);
        return true;
      }
      close() {}
    };
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: ClientCls as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    onWelcome(7, [{ commandId: 'queued-1', kind: 'kit.rebuild', args: {} }]);
    await new Promise((r) => setImmediate(r));
    expect(provider.exec).toHaveBeenCalledWith({ kind: 'kit.rebuild', args: {} });
    // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
    const sent = ClientCls.instances[0].sent as any[];
    expect(sent.find((f) => f.type === 'command_ack' && f.commandId === 'queued-1')).toBeTruthy();
    expect(
      sent.find((f) => f.type === 'command_result' && f.commandId === 'queued-1')
    ).toBeTruthy();
    handle.shutdown();
  });

  it('publishes provider snapshots on WS welcome (not before)', async () => {
    const provider = makeProvider();
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    let onWelcome: any;
    const ClientCls = class {
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      static instances: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      sent: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      constructor(public opts: { onWelcome: any; onCommand: any }) {
        onWelcome = opts.onWelcome;
        ClientCls.instances.push(this);
      }
      start() {}
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      send(f: any) {
        this.sent.push(f);
        return true;
      }
      close() {}
    };
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: ClientCls as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    // No snapshots before welcome.
    expect(provider.snapshot).not.toHaveBeenCalled();
    onWelcome(0, []);
    await new Promise((r) => setImmediate(r));
    expect(provider.snapshot).toHaveBeenCalledOnce();
    // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
    const sent = ClientCls.instances[0].sent as any[];
    const stateFrame = sent.find((f) => f.type === 'event' && f.kind === 'kit.state');
    expect(stateFrame).toBeTruthy();
    handle.shutdown();
  });

  it('emits command_result ok:false when provider.exec throws (does not crash runtime)', async () => {
    const provider = makeProvider({
      exec: vi.fn(async () => {
        throw new Error('kaboom');
      }),
    });
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    let onCommand: any;
    const ClientCls = class {
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      static instances: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      sent: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      constructor(public opts: { onCommand: any }) {
        onCommand = opts.onCommand;
        ClientCls.instances.push(this);
      }
      start() {}
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      send(f: any) {
        this.sent.push(f);
        return true;
      }
      close() {}
    };
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: ClientCls as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    onCommand({ type: 'command', commandId: 'c1', kind: 'kit.rebuild', args: {} });
    await new Promise((r) => setImmediate(r));
    // biome-ignore lint/suspicious/noExplicitAny: dynamic frame shape
    const sent = ClientCls.instances[0].sent as any[];
    const result = sent.find((f) => f.type === 'command_result');
    expect(result).toMatchObject({ commandId: 'c1', ok: false, error: 'kaboom' });
    handle.shutdown();
  });

  it('shutdown stops heartbeat + closes WS + disposes provider watchers', async () => {
    const dispose = vi.fn();
    const provider = makeProvider({ watch: vi.fn(() => ({ dispose })) });
    const handle = await runAgentRuntime({
      paired: { deviceId: 'd', workspaceId: 'w', doUrl: 'http://do' },
      token: 'tok',
      providers: [provider],
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _WSClient: MockClient as any,
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      _HeartbeatLoop: MockHB as any,
    });
    handle.onConnected();
    handle.shutdown();
    expect(MockHB.instances[0].stopped).toBe(true);
    expect(MockClient.instances[0].closed).toBe(true);
    expect(dispose).toHaveBeenCalled();
  });
});
