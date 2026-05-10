// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import open from 'open';
import { runAgentRuntime } from '../medal-connect/agent-runtime.js';
import type { HeartbeatLoop } from '../medal-connect/heartbeat.js';
import { loadDeviceToken } from '../medal-connect/keychain.js';
import type { runPairFlow } from '../medal-connect/pair-flow.js';
import type { MedalConnectProvider } from '../medal-connect/provider-types.js';
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
  /**
   * Provider factory used to assemble the set of MedalConnectProviders that
   * the runtime should manage. Defaulted to a kit-only set in production via
   * `resolveKitContext`. Tests pass an empty list (or a stub) to avoid
   * touching the filesystem.
   */
  _providers?: (paired: {
    deviceId: string;
    workspaceId: string;
    doUrl: string;
  }) => Promise<MedalConnectProvider[]>;
}

/**
 * `pilot connect` — pairs the machine with the cloud and then runs the agent
 * runtime. v1 wires the kit provider so `kit.rebuild` / `kit.cask.add` /
 * `kit.cask.remove` commands flow end-to-end.
 *
 * The runtime is composed of:
 *  1. The WS client (with auto-reconnect + welcome-driven backoff reset).
 *  2. The 5-minute app-level heartbeat backstop.
 *  3. One or more `MedalConnectProvider`s — kit today; dispatch/talk/pulse
 *     later — each contributing snapshot/watch/exec for its own namespace.
 */
export async function runConnectCommand(opts: ConnectOpts = {}): Promise<void> {
  const { runPairFlow: defaultRunPairFlow } = await import('../medal-connect/pair-flow.js');

  const runPair = opts._runPairFlow ?? defaultRunPairFlow;
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

  // Resolve providers. Tests inject an empty list; production reads
  // kit.config.json and constructs the kit provider with real deps.
  const buildProviders =
    opts._providers ??
    (async (paired) => {
      const { resolveKitContext } = await import('../medal-connect/kit-context.js');
      const { createKitProvider } = await import('@medalsocial/kit/medal-connect');
      // resolveKitContext now uses the kit package's own configCandidates()
      // so KIT_CONFIG and ~/Documents/Code/kit/kit.config.json are honored
      // identically to the standalone `pilot kit` commands.
      const kitCtx = await resolveKitContext({ machineId: paired.deviceId });
      const provider = createKitProvider({
        kitRepoDir: kitCtx.kitRepoDir,
        machineId: paired.deviceId,
        user: kitCtx.user,
        machineType: kitCtx.machineType,
        runRebuild: kitCtx.runRebuild,
        addCask: kitCtx.addCask,
        removeCask: kitCtx.removeCask,
        commitAndPush: kitCtx.commitAndPush,
      });
      return [provider as unknown as MedalConnectProvider];
    });

  // Resolution failures (no kit config, machine not registered, etc.) must
  // not crash the connect command — pairing already succeeded; the agent can
  // still run with zero providers and the user can fix the config and
  // reconnect. Surface a user-facing message via PilotError when available;
  // never echo the raw exception body to stdout (Qodo Security: don't leak
  // file paths / tooling specifics into the CLI surface).
  let providers: MedalConnectProvider[] = [];
  try {
    providers = await buildProviders(result);
  } catch (e) {
    const { PilotError } = await import('../errors.js');
    if (e instanceof PilotError) {
      out(`  Kit setup skipped: ${e.message}\n`);
    } else {
      out('  Kit setup skipped — see `pilot kit status` for details.\n');
    }
  }

  const handle = await runAgentRuntime({
    paired: result,
    token: stored.token,
    providers,
    out,
    _WSClient: opts._WSClient,
    _HeartbeatLoop: opts._HeartbeatLoop,
  });
  // The runtime self-publishes provider snapshots on every WS welcome (initial
  // connect + every reconnect). No need to call `handle.onConnected()` here —
  // doing so would emit a snapshot before the socket is OPEN and the frame
  // would be dropped.

  // Graceful shutdown on Ctrl-C / SIGTERM.
  const cleanup = () => {
    handle.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
