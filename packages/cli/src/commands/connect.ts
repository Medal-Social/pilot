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
    throw new Error(`keychain_lost_token: ${result.deviceId}`);
  }

  const wsUrl = `${result.doUrl.replace(/^http/, 'ws')}/ws/${result.workspaceId}`;
  const ws = new WSC({
    url: wsUrl,
    deviceId: result.deviceId,
    token: stored.token,
    onConnect: () => out('  WS connected\n'),
    onDisconnect: (code: number) => out(`  WS disconnected (${code})\n`),
    onWelcome: (rev: number) => out(`  Resumed at rev ${rev}\n`),
    onRejected: (reason: string) => {
      out(`  Rejected: ${reason}\n`);
      process.exit(1);
    },
  });
  ws.start();

  const heartbeat = new HL(ws);
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
