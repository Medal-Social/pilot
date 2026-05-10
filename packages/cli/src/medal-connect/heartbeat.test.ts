import { describe, expect, it, vi } from 'vitest';
import { HeartbeatLoop } from './heartbeat';

describe('HeartbeatLoop', () => {
  it('emits a heartbeat immediately on start', () => {
    const send = vi.fn(() => true);
    const client = { send };
    const loop = new HeartbeatLoop(client, () => 1000);
    loop.start();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ type: 'heartbeat', ts: 1000 });
    loop.stop();
  });

  it('emits heartbeat on each 5min interval', () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => true);
      const client = { send };
      const loop = new HeartbeatLoop(client, () => Date.now());
      loop.start();
      // Initial tick
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
      vi.advanceTimersByTime(5 * 60_000);
      expect(send).toHaveBeenCalledTimes(2);
      loop.stop();
      vi.advanceTimersByTime(15 * 60_000);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits heartbeat with current ts from injected nowFn', () => {
    const now = 5000;
    const send = vi.fn(() => true);
    const loop = new HeartbeatLoop({ send }, () => now);
    loop.start();
    expect(send.mock.calls[0][0]).toEqual({ type: 'heartbeat', ts: 5000 });
    loop.stop();
  });

  it('continues ticking even when send returns false (offline socket)', () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => false);
      const loop = new HeartbeatLoop({ send }, () => Date.now());
      loop.start();
      vi.advanceTimersByTime(15 * 60_000);
      expect(send).toHaveBeenCalledTimes(4); // initial + 3 intervals
      loop.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
