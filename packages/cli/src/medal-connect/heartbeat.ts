import type { WSClient } from './ws-client';

/**
 * Sends a heartbeat frame every 5 minutes (app-level liveness backstop).
 *
 * Per spec §4: CF protocol-level WS pings handle intra-window liveness; the
 * app-level heartbeat is a 5-minute backstop against half-open sockets.
 *
 * Emits one heartbeat immediately on start so the DO records `last_heartbeat_at`
 * promptly after hello — without it, the first beat would arrive 5 minutes later
 * and the DO's offline-detection would race against pair completion.
 */
export class HeartbeatLoop {
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 5 * 60_000;

  constructor(
    private client: Pick<WSClient, 'send'>,
    private nowFn: () => number = Date.now
  ) {}

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), HeartbeatLoop.INTERVAL_MS);
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
