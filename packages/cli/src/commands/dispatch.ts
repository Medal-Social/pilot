// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { errorCodes, PilotError } from '../errors.js';
import { createDispatchHost } from '../plugins/dispatch-host.js';
import type { DispatchPluginLike } from '../plugins/dispatch-loader.js';
import { loadDispatchPlugin } from '../plugins/dispatch-loader.js';
import { runInherit } from '../shell/exec.js';

const DISPATCH_PASSTHROUGH_ENV = { DISPATCH_PILOT_HOST: '1' } as const;
const DISPATCH_NPX_ARGS = ['-y', '@medalsocial/dispatch'] as const;

function unavailable(): never {
  throw new PilotError(errorCodes.DISPATCH_UNAVAILABLE);
}

async function withPlugin<T>(fn: (plugin: DispatchPluginLike) => Promise<T>): Promise<T> {
  // Pilot's dispatch host stub: log/email forwarders go to stdout/stderr until
  // the daemon supervisor wires this up to the production hub.
  const host = createDispatchHost({
    log: {
      info: (m, meta) =>
        process.stdout.write(`[pilot:info] ${m}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`),
      warn: (m, meta) =>
        process.stderr.write(`[pilot:warn] ${m}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`),
      error: (m, meta) =>
        process.stderr.write(`[pilot:error] ${m}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`),
      debug: () => {},
    },
    secretsStore: {},
    medalSocial: null,
    sendEmail: async (msg) => {
      const to = Array.isArray(msg.to) ? msg.to.join(', ') : msg.to;
      process.stdout.write(`[pilot:email] -> ${to} :: ${msg.subject}\n`);
      return { id: `pilot-${Date.now()}` };
    },
  });
  const plugin = await loadDispatchPlugin({
    opts: { db: null, feed: null, deviceId: 'pilot-cli', host },
  });
  if (!plugin) unavailable();
  return fn(plugin);
}

export async function runDispatchStatus(): Promise<void> {
  await withPlugin(async (plugin) => {
    const h = await plugin.health();
    process.stdout.write(`${JSON.stringify(h, null, 2)}\n`);
  });
}

export async function runDispatchUp(): Promise<void> {
  // Spawns the dispatch hub under Pilot's supervision via the centralized
  // shell/exec runInherit helper (the only sanctioned subprocess entry point).
  const code = await runInherit('npx', [...DISPATCH_NPX_ARGS, 'hub', 'start'], {
    env: { ...process.env, ...DISPATCH_PASSTHROUGH_ENV },
  });
  process.exitCode = code;
}

export async function runDispatchDown(): Promise<void> {
  // Real lifecycle ships with the daemon supervisor (tracked separately).
  // For now, surface a clear PilotError so the user knows the action isn't a no-op.
  throw new PilotError(errorCodes.DISPATCH_NOT_READY, 'pilot down dispatch');
}

export async function runDispatchPassthrough(args: string[]): Promise<void> {
  // `pilot dispatch source add ...` → npx @medalsocial/dispatch source add ...
  const code = await runInherit('npx', [...DISPATCH_NPX_ARGS, ...args], {
    env: { ...process.env, ...DISPATCH_PASSTHROUGH_ENV },
  });
  process.exitCode = code;
}
