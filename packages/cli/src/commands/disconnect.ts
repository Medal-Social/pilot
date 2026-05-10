// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { loadDeviceToken, deleteDeviceToken } from '../medal-connect/keychain.js';

const DEFAULT_API_BASE = 'https://medal.social';

export interface DisconnectOpts {
  apiBase?: string;
  // Internal seams for tests:
  _fetch?: typeof fetch;
  _stdout?: (s: string) => void;
  _stderr?: (s: string) => void;
}

export async function runDisconnectCommand(
  deviceId: string,
  opts: DisconnectOpts = {},
): Promise<void> {
  const fetchFn = opts._fetch ?? fetch;
  const out = opts._stdout ?? ((s: string) => process.stdout.write(s));
  const err = opts._stderr ?? ((s: string) => process.stderr.write(s));
  const apiBase = opts.apiBase ?? DEFAULT_API_BASE;

  const stored = loadDeviceToken(deviceId);
  if (!stored) {
    err(`No keychain record for ${deviceId}\n`);
    throw new Error('no_keychain_record');
  }

  const res = await fetchFn(`${apiBase}/api/medal-connect/unpair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, token: stored.token }),
  });

  if (!res.ok) {
    err(`Server rejected unpair: ${res.status}\n`);
    throw new Error(`server_${res.status}`);
  }

  const data = (await res.json()) as { ok: boolean; reason?: string };
  if (!data.ok) {
    err(`Unpair failed: ${data.reason ?? 'unknown'}\n`);
    throw new Error(`unpair_${data.reason ?? 'unknown'}`);
  }

  deleteDeviceToken(deviceId);
  out(`Disconnected ${deviceId}\n`);
}

export function runDisconnect(deviceId: string, apiBase?: string): Promise<void> {
  return runDisconnectCommand(deviceId, { apiBase });
}
