// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Logger, PilotHost } from './types.js';

export interface StandaloneHostOptions {
  /** Defaults to a console-backed logger. */
  log?: Logger;
  /** Env-style map used by `secrets.get`. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

const consoleLogger: Logger = {
  info: (msg, meta) => console.log(`[pilot:info] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[pilot:warn] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[pilot:error] ${msg}`, meta ?? ''),
  debug: (msg, meta) => {
    if (process.env.DEBUG) console.debug(`[pilot:debug] ${msg}`, meta ?? '');
  },
};

let nextStandaloneId = 0;

export function makeStandaloneHost(opts: StandaloneHostOptions = {}): PilotHost {
  const log = opts.log ?? consoleLogger;
  const env = opts.env ?? process.env;
  return {
    cloud: {
      async send(event) {
        log.debug('pilot.cloud.send (standalone — no-op)', {
          plugin: event.plugin,
          kind: event.kind,
          id: event.id,
        });
      },
    },
    email: {
      async send(msg) {
        const id = `standalone-${++nextStandaloneId}`;
        log.info('pilot.email.send (standalone)', { to: msg.to, subject: msg.subject, id });
        return { id };
      },
    },
    secrets: {
      async get(name) {
        return env[name] ?? null;
      },
    },
    auth: {
      medalSocial() {
        return null;
      },
    },
    log,
  };
}
