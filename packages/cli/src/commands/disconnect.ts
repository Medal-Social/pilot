// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { PilotError, errorCodes } from '../errors.js';
import { deleteDeviceToken, loadDeviceToken } from '../medal-connect/keychain.js';

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
  opts: DisconnectOpts = {}
): Promise<void> {
  const fetchFn = opts._fetch ?? fetch;
  const out = opts._stdout ?? ((s: string) => process.stdout.write(s));
  const apiBase = opts.apiBase ?? DEFAULT_API_BASE;

  const stored = loadDeviceToken(deviceId);
  if (!stored) {
    throw new PilotError(errorCodes.DISCONNECT_NO_KEYCHAIN_RECORD, deviceId);
  }

  const res = await fetchFn(`${apiBase}/api/medal-connect/unpair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, token: stored.token }),
  });

  if (!res.ok) {
    throw new PilotError(errorCodes.DISCONNECT_SERVER_ERROR, `HTTP ${res.status}`);
  }

  // Parse defensively — a 2xx with non-JSON body should not become a raw
  // SyntaxError stack trace at the top level. Map to a typed PilotError.
  let data: { ok?: boolean; reason?: string };
  try {
    data = (await res.json()) as { ok?: boolean; reason?: string };
  } catch (e) {
    throw new PilotError(errorCodes.DISCONNECT_BAD_RESPONSE, (e as Error).message);
  }

  if (!data.ok) {
    throw new PilotError(errorCodes.DISCONNECT_UNPAIR_FAILED, data.reason);
  }

  deleteDeviceToken(deviceId);
  out(`Disconnected ${deviceId}\n`);
}

export function runDisconnect(deviceId: string, apiBase?: string): Promise<void> {
  return runDisconnectCommand(deviceId, { apiBase });
}
