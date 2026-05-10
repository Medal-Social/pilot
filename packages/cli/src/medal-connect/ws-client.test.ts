import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { WSClient } from './ws-client';

class MockWS extends EventEmitter {
  static instances: MockWS[] = [];
  readyState = 0;
  sent: string[] = [];
  url: string;
  closeCalls: Array<{ code: number; reason: string }> = [];

  constructor(url: string) {
    super();
    this.url = url;
    MockWS.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code: number, reason: string): void {
    this.closeCalls.push({ code, reason });
    this.emit('close', code, Buffer.from(reason));
  }
  open(): void {
    this.readyState = 1;
    this.emit('open');
  }
  receive(payload: object): void {
    this.emit('message', JSON.stringify(payload));
  }
}

describe('WSClient', () => {
  it('sends hello on open with since: 0 initially', () => {
    MockWS.instances = [];
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
    });
    client.start();
    const ws = MockWS.instances[0];
    ws.open();
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'hello',
      deviceId: 'd1',
      token: 'tok',
      since: 0,
    });
  });

  it('updates rev on welcome frames', () => {
    MockWS.instances = [];
    const onWelcome = vi.fn();
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
      onWelcome,
    });
    client.start();
    const ws = MockWS.instances[0];
    ws.open();
    ws.receive({ type: 'welcome', rev: 42, queuedCommands: [] });
    expect(onWelcome).toHaveBeenCalledWith(42, []);
    expect(client.currentRev).toBe(42);
  });

  it('reconnects on close and resumes from current rev', async () => {
    MockWS.instances = [];
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
      reconnectBaseMs: 1,
    });
    client.start();
    let ws = MockWS.instances[0];
    ws.open();
    ws.receive({ type: 'welcome', rev: 42, queuedCommands: [] });
    ws.emit('close', 1006, Buffer.from('socket_closed'));

    // Wait for the reconnect timer.
    await new Promise((r) => setTimeout(r, 5));
    expect(MockWS.instances).toHaveLength(2);
    ws = MockWS.instances[1];
    ws.open();
    expect(JSON.parse(ws.sent[0])).toMatchObject({ type: 'hello', since: 42 });
  });

  it('does NOT reconnect after rejected', async () => {
    MockWS.instances = [];
    const onRejected = vi.fn();
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
      onRejected,
      reconnectBaseMs: 1,
    });
    client.start();
    const ws = MockWS.instances[0];
    ws.open();
    ws.receive({ type: 'rejected', reason: 'token_invalid' });
    ws.emit('close', 1008, Buffer.from('rejected'));
    expect(onRejected).toHaveBeenCalledWith('token_invalid');
    await new Promise((r) => setTimeout(r, 5));
    expect(MockWS.instances).toHaveLength(1);
  });

  it('forwards command frames to onCommand', () => {
    MockWS.instances = [];
    const onCommand = vi.fn();
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
      onCommand,
    });
    client.start();
    const ws = MockWS.instances[0];
    ws.open();
    ws.receive({
      type: 'command',
      commandId: 'cmd-1',
      kind: 'kit.rebuild',
      args: {},
    });
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0][0]).toMatchObject({
      type: 'command',
      commandId: 'cmd-1',
      kind: 'kit.rebuild',
    });
  });

  it('send returns false when socket not open', () => {
    MockWS.instances = [];
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
    });
    // Before start: no socket
    expect(client.send({ type: 'heartbeat', ts: 1 })).toBe(false);
  });

  it('close prevents reconnect after intentional close', async () => {
    MockWS.instances = [];
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
      reconnectBaseMs: 1,
    });
    client.start();
    const ws = MockWS.instances[0];
    ws.open();
    client.close();
    expect(ws.closeCalls).toHaveLength(1);
    expect(ws.closeCalls[0]).toEqual({ code: 1000, reason: 'client_close' });
    await new Promise((r) => setTimeout(r, 5));
    expect(MockWS.instances).toHaveLength(1);
  });

  it('exponential backoff increases delay between reconnects', async () => {
    MockWS.instances = [];
    const client = new WSClient({
      url: 'ws://x',
      deviceId: 'd1',
      token: 'tok',
      WebSocketCtor: MockWS as unknown as typeof WebSocket,
      reconnectBaseMs: 10,
      reconnectMaxMs: 1000,
    });
    client.start();
    // First close → reconnect after 10ms
    let ws = MockWS.instances[0];
    ws.emit('close', 1006, Buffer.from(''));
    const t1 = Date.now();
    await new Promise((r) => setTimeout(r, 30));
    expect(MockWS.instances.length).toBeGreaterThanOrEqual(2);
    // Second close → reconnect after 20ms
    ws = MockWS.instances[MockWS.instances.length - 1];
    ws.emit('close', 1006, Buffer.from(''));
    await new Promise((r) => setTimeout(r, 50));
    expect(MockWS.instances.length).toBeGreaterThanOrEqual(3);
    // Sanity: at least 50ms have elapsed across the two reconnects
    expect(Date.now() - t1).toBeGreaterThanOrEqual(20);
    client.close();
  });
});
