import { describe, expect, it, vi } from 'vitest';
import { HeartbeatLoop } from './heartbeat';

describe('HeartbeatLoop', () => {
  it('does NOT emit a heartbeat immediately on start (avoids ws-not-yet-open race)', () => {
    const send = vi.fn(() => true);
    const client = { send };
    const loop = new HeartbeatLoop(client, () => 1000);
    loop.start();
    // Codex P2: ws.send returns false until the socket is OPEN; emitting
    // immediately would silently drop the first beat. Caller must call
    // kick() from onWelcome instead.
    expect(send).not.toHaveBeenCalled();
    loop.stop();
  });

  it('kick() emits an immediate heartbeat with the current ts', () => {
    const send = vi.fn(() => true);
    const client = { send };
    const loop = new HeartbeatLoop(client, () => 1000);
    loop.start();
    loop.kick();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ type: 'heartbeat', ts: 1000 });
    loop.stop();
  });

  it('emits heartbeat on each 5min interval after kick', () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => true);
      const client = { send };
      const loop = new HeartbeatLoop(client, () => Date.now());
      loop.start();
      loop.kick();
      // After kick: 1 send.
      expect(send).toHaveBeenCalledTimes(1);
      // Tick 1: 5min
      vi.advanceTimersByTime(5 * 60_000);
      expect(send).toHaveBeenCalledTimes(2);
      // Tick 2: another 5min
      vi.advanceTimersByTime(5 * 60_000);
      expect(send).toHaveBeenCalledTimes(3);
      loop.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop clears the interval — no further heartbeats', () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => false);
      const loop = new HeartbeatLoop({ send }, () => Date.now());
      loop.start();
      loop.kick();
      vi.advanceTimersByTime(5 * 60_000);
      expect(send).toHaveBeenCalledTimes(2); // kick + 1 interval
      loop.stop();
      vi.advanceTimersByTime(15 * 60_000);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kick uses current ts from injected nowFn', () => {
    let now = 5000;
    const send = vi.fn(() => true);
    const loop = new HeartbeatLoop({ send }, () => now);
    loop.start();
    loop.kick();
    expect(send.mock.calls[0][0]).toEqual({ type: 'heartbeat', ts: 5000 });
    now = 9999;
    loop.kick();
    expect(send.mock.calls[1][0]).toEqual({ type: 'heartbeat', ts: 9999 });
    loop.stop();
  });

  it('continues ticking even when send returns false (offline socket)', () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => false);
      const loop = new HeartbeatLoop({ send }, () => Date.now());
      loop.start();
      loop.kick();
      vi.advanceTimersByTime(15 * 60_000);
      expect(send).toHaveBeenCalledTimes(4); // kick + 3 intervals
      loop.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
