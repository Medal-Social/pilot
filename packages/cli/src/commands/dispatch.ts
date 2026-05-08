// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createDispatchHost } from '../plugins/dispatch-host.js';
import type { DispatchPluginLike } from '../plugins/dispatch-loader.js';
import { loadDispatchPlugin } from '../plugins/dispatch-loader.js';

const PLUGIN_ID = '@medalsocial/dispatch';

function unavailable(): never {
  console.error(
    `${PLUGIN_ID} is not installed. Run \`npm i -g ${PLUGIN_ID}\` then re-run this command.`
  );
  process.exit(1);
}

async function withPlugin<T>(fn: (plugin: DispatchPluginLike) => Promise<T>): Promise<T> {
  // Pilot's dispatch host stub for plan 7 — cloud.send logs only.
  const host = createDispatchHost({
    log: {
      info: (m, meta) => console.log(`[pilot:info] ${m}`, meta ?? ''),
      warn: (m, meta) => console.warn(`[pilot:warn] ${m}`, meta ?? ''),
      error: (m, meta) => console.error(`[pilot:error] ${m}`, meta ?? ''),
      debug: () => {},
    },
    secretsStore: {},
    medalSocial: null,
    sendEmail: async (msg) => {
      console.log(
        `[pilot:email] -> ${Array.isArray(msg.to) ? msg.to.join(', ') : msg.to} :: ${msg.subject}`
      );
      return { id: `pilot-${Date.now()}` };
    },
  });
  // Open the dispatch hub DB read-only-ish — plan 7 just calls health().
  // Real syncStream/applyRemote wiring runs only when `pilot up dispatch`
  // keeps the daemon alive (next plan).
  const plugin = await loadDispatchPlugin({
    opts: { db: null, feed: null, deviceId: 'pilot-cli', host },
  });
  if (!plugin) unavailable();
  return fn(plugin);
}

export async function runDispatchStatus(): Promise<void> {
  await withPlugin(async (plugin) => {
    const h = await plugin.health();
    console.log(JSON.stringify(h, null, 2));
  });
}

export async function runDispatchUp(): Promise<void> {
  // Plan 7: spawn `dispatch hub start` under Pilot — child process.
  const { spawn } = await import('node:child_process');
  const child = spawn('npx', ['-y', '@medalsocial/dispatch', 'hub', 'start'], {
    stdio: 'inherit',
    env: { ...process.env, DISPATCH_PILOT_HOST: '1' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

export async function runDispatchDown(): Promise<void> {
  // Stub for plan 7 — sends SIGTERM to a tracked PID file; real lifecycle is the next plan.
  console.log('pilot down dispatch — TODO: requires plan 8 daemon supervisor');
}

export async function runDispatchPassthrough(args: string[]): Promise<void> {
  // `pilot dispatch source add ...` → npx @medalsocial/dispatch source add ...
  const { spawn } = await import('node:child_process');
  const child = spawn('npx', ['-y', '@medalsocial/dispatch', ...args], {
    stdio: 'inherit',
    env: { ...process.env, DISPATCH_PILOT_HOST: '1' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
