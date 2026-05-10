import type { WSClient } from './ws-client.js';

/**
 * Sends a heartbeat frame every 5 minutes (app-level liveness backstop).
 *
 * Per spec §4: CF protocol-level WS pings handle intra-window liveness; the
 * app-level heartbeat is a 5-minute backstop against half-open sockets.
 *
 * Lifecycle:
 *  - `start()` schedules the recurring tick but does NOT emit immediately;
 *    the first send would race with the WebSocket `open` event and silently
 *    return false (WSClient.send returns false until readyState === OPEN).
 *  - Call `kick()` from the WS `onWelcome` callback to send the first beat
 *    once the socket is fully ready. After that, the interval keeps firing.
 */
export class HeartbeatLoop {
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 5 * 60_000;

  constructor(
    private client: Pick<WSClient, 'send'>,
    private nowFn: () => number = Date.now
  ) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), HeartbeatLoop.INTERVAL_MS);
  }

  /**
   * Send one heartbeat immediately. Idempotent and safe to call before or
   * after `start()`. Intended for the WS `onWelcome` callback so the DO
   * records `last_heartbeat_at` promptly after the welcome frame.
   */
  kick(): void {
    this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    this.client.send({ type: 'heartbeat', ts: this.nowFn() });
  }
}
