import WebSocket from 'ws';
import type { AgentFrame, ServerFrame } from './frames.js';
import { parseServerFrame } from './frames.js';

type WelcomeFrame = Extract<ServerFrame, { type: 'welcome' }>;
type CommandFrame = Extract<ServerFrame, { type: 'command' }>;

export interface WSClientOptions {
  url: string;
  deviceId: string;
  token: string;
  WebSocketCtor?: typeof WebSocket;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  onWelcome?: (rev: number, queuedCommands: WelcomeFrame['queuedCommands']) => void;
  onCommand?: (cmd: CommandFrame) => void;
  onRejected?: (reason: string) => void;
  onConnect?: () => void;
  onDisconnect?: (code: number, reason: string) => void;
}

/**
 * Long-lived WebSocket client for the Medal Connect agent.
 *
 *  - Sends `hello` immediately on open with `since: rev` (rev tracked across reconnects).
 *  - Updates `rev` from each `welcome` frame so subsequent reconnects can resume.
 *  - Exponential backoff reconnect on close (unless rejected — auth failure means stop).
 *  - Single-flight: caller calls `start()` once. `close()` is the only graceful stop.
 */
export class WSClient {
  private ws: WebSocket | null = null;
  private rev = 0;
  private reconnectAttempt = 0;
  private closing = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private opts: WSClientOptions) {}

  start(): void {
    this.connect();
  }

  send(frame: AgentFrame): boolean {
    if (!this.ws || this.ws.readyState !== 1 /* OPEN */) return false;
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  close(): void {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) this.ws.close(1000, 'client_close');
  }

  /** Internal — exposed for tests; do not call from product code. */
  get currentRev(): number {
    return this.rev;
  }

  private connect(): void {
    if (this.closing) return;
    const Ctor = this.opts.WebSocketCtor ?? WebSocket;
    const ws = new Ctor(this.opts.url) as WebSocket;
    this.ws = ws;

    ws.on('open', () => {
      // Do NOT reset `reconnectAttempt` here. A successful TCP/WebSocket
      // handshake does not yet mean the server has accepted us — the DO
      // can still close the socket immediately for auth or routing
      // reasons (see also the rejected branch below). If we reset on open,
      // a flapping endpoint that accepts the handshake but always closes
      // before sending `welcome` would retry once per `reconnectBaseMs`
      // forever instead of backing off (Codex P2 'Reset reconnect backoff
      // only after welcome'). The counter is reset in the `welcome` branch
      // of the message handler instead.
      this.opts.onConnect?.();
      this.send({
        type: 'hello',
        deviceId: this.opts.deviceId,
        token: this.opts.token,
        since: this.rev,
      });
    });

    ws.on('message', (data) => {
      let frame: ServerFrame;
      try {
        frame = parseServerFrame(JSON.parse(data.toString()));
      } catch {
        return;
      }
      if (frame.type === 'welcome') {
        // Only a `welcome` frame proves the server has fully accepted us:
        // auth verified, session resumed, ready to deliver commands. Reset
        // the backoff counter here so a transient close after a known-good
        // session starts fresh, but a flapping endpoint that never reaches
        // `welcome` continues to back off exponentially.
        this.reconnectAttempt = 0;
        this.rev = frame.rev;
        this.opts.onWelcome?.(frame.rev, frame.queuedCommands);
      } else if (frame.type === 'rejected') {
        this.opts.onRejected?.(frame.reason);
        // Auth failure: do NOT reconnect.
        this.closing = true;
      } else if (frame.type === 'command') {
        this.opts.onCommand?.(frame);
      }
    });

    ws.on('close', (code, reason) => {
      const reasonStr = typeof reason === 'string' ? reason : (reason?.toString() ?? '');
      this.opts.onDisconnect?.(code, reasonStr);
      this.ws = null;
      if (!this.closing) this.scheduleReconnect();
    });

    ws.on('error', () => {
      // Swallow — close handler runs after error, that's where reconnect lives.
    });
  }

  private scheduleReconnect(): void {
    const base = this.opts.reconnectBaseMs ?? 1000;
    const max = this.opts.reconnectMaxMs ?? 30_000;
    const delay = Math.min(max, base * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
