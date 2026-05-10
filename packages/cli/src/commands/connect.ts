// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import open from 'open';
import type { HeartbeatLoop } from '../medal-connect/heartbeat.js';
import { loadDeviceToken } from '../medal-connect/keychain.js';
import type { runPairFlow } from '../medal-connect/pair-flow.js';
import type { WSClient } from '../medal-connect/ws-client.js';

export interface ConnectOpts {
  apiBase?: string;
  headless?: boolean;
  workspace?: string; // advisory; user still confirms in browser
  // Internal seams for tests:
  _runPairFlow?: typeof runPairFlow;
  _WSClient?: typeof WSClient;
  _HeartbeatLoop?: typeof HeartbeatLoop;
  _open?: typeof open;
  _stdout?: (s: string) => void;
}

export async function runConnectCommand(opts: ConnectOpts = {}): Promise<void> {
  const { runPairFlow: defaultRunPairFlow } = await import('../medal-connect/pair-flow.js');
  const { WSClient: DefaultWSClient } = await import('../medal-connect/ws-client.js');
  const { HeartbeatLoop: DefaultHeartbeatLoop } = await import('../medal-connect/heartbeat.js');

  const runPair = opts._runPairFlow ?? defaultRunPairFlow;
  const WSC = opts._WSClient ?? DefaultWSClient;
  const HL = opts._HeartbeatLoop ?? DefaultHeartbeatLoop;
  const openFn = opts._open ?? open;
  const out = opts._stdout ?? ((s: string) => process.stdout.write(s));

  out('Connecting to Medal Social...\n');

  const result = await runPair({
    apiBase: opts.apiBase,
    workspace: opts.workspace,
    onCode: (code: string, claimUrl: string) => {
      const formatted = `${code.slice(0, 3)}-${code.slice(3)}`;
      out(`\n  Code: ${formatted}\n`);
      out(`  Open: ${claimUrl}\n\n`);
      if (!opts.headless) {
        void openFn(claimUrl).catch(() => {
          // Browser open failed; URL is already printed.
        });
      }
    },
  });

  out(`Connected as ${result.deviceId}\n`);

  // Sanity-check the token landed in the keychain.
  const stored = loadDeviceToken(result.deviceId);
  if (!stored) {
    const { PilotError, errorCodes } = await import('../errors.js');
    throw new PilotError(errorCodes.CONNECT_KEYCHAIN_LOST_TOKEN, result.deviceId);
  }

  const wsUrl = `${result.doUrl.replace(/^http/, 'ws')}/ws/${result.workspaceId}`;
  // Build a heartbeat that holds a forward reference to the WS client so we
  // can `kick()` it from onWelcome (after readyState === OPEN). This avoids
  // the Codex P2 race where heartbeat.start() ticks immediately while the
  // socket is still CONNECTING and ws.send() returns false.
  let heartbeat: HeartbeatLoop;

  // Process a single command frame: log it, ack receipt, and (for the
  // duration of v1) immediately fail it with `unknown_kind`. Real command
  // execution lands in v1.1; what matters here is that v1 doesn't silently
  // drop work — the cloud sees an ack and a result, and the queue advances
  // instead of staying pending forever.
  function processCommand(cmd: { commandId: string; kind: string; args: Record<string, unknown> }) {
    out(`  Command: ${cmd.kind} (${cmd.commandId})\n`);
    ws.send({ type: 'command_ack', commandId: cmd.commandId, received: true });
    ws.send({
      type: 'command_result',
      commandId: cmd.commandId,
      ok: false,
      error: `unsupported_kind:${cmd.kind}`,
    });
  }

  const ws = new WSC({
    url: wsUrl,
    deviceId: result.deviceId,
    token: stored.token,
    onConnect: () => out('  WS connected\n'),
    onDisconnect: (code: number) => out(`  WS disconnected (${code})\n`),
    onWelcome: (rev: number, queuedCommands) => {
      out(`  Resumed at rev ${rev}\n`);
      heartbeat?.kick();
      // Drain any queued work the DO sent in the welcome frame. Without this,
      // commands enqueued while the agent was offline would never be acked
      // and would stay pending forever (Codex P2 'Wire socket commands').
      for (const cmd of queuedCommands ?? []) {
        processCommand(cmd);
      }
    },
    onCommand: (cmd) => processCommand(cmd),
    onRejected: async (reason: string) => {
      const { PilotError, errorCodes } = await import('../errors.js');
      out(`  Rejected: ${reason}\n`);
      const err = new PilotError(errorCodes.CONNECT_REJECTED, reason);
      process.stderr.write(`Connect rejected [${err.code}]: ${err.message}\n`);
      process.exit(1);
    },
  });
  ws.start();

  heartbeat = new HL(ws);
  heartbeat.start();

  // Graceful shutdown on Ctrl-C / SIGTERM.
  const cleanup = () => {
    heartbeat.stop();
    ws.close();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
