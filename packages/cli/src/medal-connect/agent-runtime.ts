// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { HeartbeatLoop } from './heartbeat.js';
import type { Disposable, MedalConnectProvider, ProviderEvent } from './provider-types.js';
import { WSClient } from './ws-client.js';

export interface RunAgentRuntimeOpts {
  paired: { deviceId: string; workspaceId: string; doUrl: string };
  token: string;
  providers: MedalConnectProvider[];
  /**
   * Optional stdout sink for status text emitted from the runtime (welcome
   * notice, queued-command notes). Defaults to a no-op so tests stay quiet.
   */
  out?: (s: string) => void;
  // Test seams:
  _WSClient?: typeof WSClient;
  _HeartbeatLoop?: typeof HeartbeatLoop;
}

export interface AgentRuntimeHandle {
  /**
   * Re-emit each provider's snapshot as an event frame. The runtime also runs
   * this automatically on every WS welcome (initial connect + every reconnect),
   * so callers normally don't need to invoke it. Kept for test ergonomics and
   * for callers that want to force a snapshot refresh out of band.
   */
  onConnected(): void;
  shutdown(): void;
}

interface CommandFrame {
  type: 'command';
  commandId: string;
  kind: string;
  args: Record<string, unknown>;
}

/**
 * Wires a long-lived WebSocket session to a set of `MedalConnectProvider`s.
 *
 *  - Forwards each provider's watch events as `event` frames.
 *  - Routes incoming `command` frames to the matching provider by namespace
 *    prefix (`<id>.<verb>`); acks delivery and emits a `command_result` with
 *    the provider's `ExecResult`.
 *  - On `onConnected()` (called by the caller after the WS welcome), pushes
 *    each provider's current snapshot as a `<id>.state` event so the cloud
 *    sees authoritative state on every reconnect.
 */
export async function runAgentRuntime(opts: RunAgentRuntimeOpts): Promise<AgentRuntimeHandle> {
  const WSC = opts._WSClient ?? WSClient;
  const HL = opts._HeartbeatLoop ?? HeartbeatLoop;
  const out = opts.out ?? (() => undefined);

  const wsUrl = `${opts.paired.doUrl.replace(/^http/, 'ws')}/ws/${opts.paired.workspaceId}`;
  const watchers: Disposable[] = [];

  // Forward declaration so the WSClient onCommand handler can call into it.
  let send: ((frame: unknown) => boolean) | null = null;

  // Heartbeat is constructed up front (so we can `kick()` it from the welcome
  // handler) but holds a forward reference to the WS client.
  let heartbeat: HeartbeatLoop | null = null;

  // Initial-snapshot publisher. Called from `onWelcome` (so the socket is
  // proven OPEN) and exposed as `handle.onConnected()` for tests / out-of-band
  // refreshes. Each provider's snapshot is pushed as a `<id>.state` event.
  const pushSnapshots = () => {
    for (const p of opts.providers) {
      void p
        .snapshot()
        .then((snap) => {
          send?.({ type: 'event', kind: `${p.id}.state`, payload: snap });
        })
        .catch(() => undefined);
    }
  };

  const ws = new WSC({
    url: wsUrl,
    deviceId: opts.paired.deviceId,
    token: opts.token,
    onWelcome: (rev, queuedCommands) => {
      out(`  Resumed at rev ${rev}\n`);
      // Per WSClient lifecycle: only after `welcome` is the socket fully
      // accepted (auth verified, session resumed). This is the safe point to
      // push initial snapshots and to drain any commands the DO queued while
      // we were offline.
      heartbeat?.kick();
      pushSnapshots();
      for (const queued of queuedCommands ?? []) {
        void handleCommand({
          type: 'command',
          commandId: queued.commandId,
          kind: queued.kind,
          args: queued.args,
        });
      }
    },
    onCommand: (cmd) => {
      void handleCommand(cmd as CommandFrame);
    },
  });
  ws.start();
  // biome-ignore lint/suspicious/noExplicitAny: WSClient.send signature is internal-typed
  send = (frame) => ws.send(frame as any);

  heartbeat = new HL(ws);
  heartbeat.start();

  // Wire each provider's watcher to forward kit.state (or any provider event)
  // as an `event` frame. The provider emits `{ kind: 'state', snapshot }` for
  // its own state and arbitrary `{ kind, payload }` for everything else.
  for (const p of opts.providers) {
    const sub = p.watch((event: ProviderEvent) => {
      // ProviderEvent is a discriminated union: `{ kind: 'state', snapshot }`
      // or `{ kind, payload }`. The non-state branch keys on `payload` so the
      // narrowing is on `kind === 'state'`.
      if (event.kind === 'state') {
        send?.({
          type: 'event',
          kind: `${p.id}.state`,
          payload: (event as { kind: 'state'; snapshot: Record<string, unknown> }).snapshot,
        });
      } else {
        send?.({
          type: 'event',
          kind: event.kind,
          payload: (event as { kind: string; payload: Record<string, unknown> }).payload,
        });
      }
    });
    watchers.push(sub);
  }

  async function handleCommand(cmd: CommandFrame): Promise<void> {
    // Ack delivery first so the cloud can mark delivered_at.
    send?.({ type: 'command_ack', commandId: cmd.commandId, received: true });

    // Provider lookup by namespace prefix.
    const providerId = cmd.kind.split('.')[0] ?? '';
    const provider = opts.providers.find((p) => p.id === providerId);
    if (!provider) {
      send?.({
        type: 'command_result',
        commandId: cmd.commandId,
        ok: false,
        error: `no provider for kind: ${cmd.kind}`,
      });
      return;
    }

    // Lifecycle: started → result. The verb portion follows the provider id
    // and a single dot (e.g. `kit.rebuild` → verb `rebuild`).
    const verb = cmd.kind.slice(providerId.length + 1);
    send?.({
      type: 'event',
      kind: `${providerId}.${verb}.started`,
      payload: { commandId: cmd.commandId },
    });

    const r = await provider.exec({ kind: cmd.kind, args: cmd.args });
    if (r.status === 'ok') {
      send?.({
        type: 'command_result',
        commandId: cmd.commandId,
        ok: true,
        result: r.result ?? {},
      });
    } else if (r.status === 'failed') {
      send?.({ type: 'command_result', commandId: cmd.commandId, ok: false, error: r.error });
    } else {
      // awaiting_user — v1.1 path; ack only.
      send?.({ type: 'command_awaiting_user', commandId: cmd.commandId, prompt: r.prompt });
    }
  }

  return {
    onConnected() {
      // Snapshots are published automatically on `onWelcome`; this is kept as
      // an out-of-band hook for tests and callers that want to force-refresh.
      pushSnapshots();
    },
    shutdown() {
      for (const w of watchers) {
        try {
          w.dispose();
        } catch {
          /* noop */
        }
      }
      heartbeat?.stop();
      ws.close();
    },
  };
}
