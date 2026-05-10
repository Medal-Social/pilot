// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { errorCodes, PilotError } from '../errors.js';
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

  // Server unpair succeeded; now delete the local keychain entry. If the OS
  // refuses (locked keychain, permission revoked), surface a typed error
  // instead of falsely reporting "Disconnected" while credentials remain on
  // disk.
  //
  // @napi-rs/keyring's Entry.deletePassword() can either return `false` (item
  // not found) OR throw a keychain error (locked, permission denied, OS-level
  // failure — see the package's index.d.ts). Treat both as the same typed
  // failure; users see one consistent message and the underlying OS error
  // message is attached as `cause` for support diagnostics. Without the
  // try/catch, a thrown deletion error would bubble out as a raw stack trace
  // and the local credential could remain stuck despite the server having
  // already revoked the device (Codex P2).
  let deleted: boolean;
  try {
    deleted = deleteDeviceToken(deviceId);
  } catch (e) {
    // OS-level keychain error (locked, permission denied, etc.). Wrap it in
    // a typed PilotError; attach the underlying message via `cause` after
    // construction so support has the OS-level reason, but the user-facing
    // message stays the consistent DISCONNECT_KEYCHAIN_DELETE_FAILED string.
    const wrapped = new PilotError(errorCodes.DISCONNECT_KEYCHAIN_DELETE_FAILED, deviceId);
    wrapped.cause = e;
    throw wrapped;
  }
  if (!deleted) {
    throw new PilotError(errorCodes.DISCONNECT_KEYCHAIN_DELETE_FAILED, deviceId);
  }
  out(`Disconnected ${deviceId}\n`);
}

export function runDisconnect(deviceId: string, apiBase?: string): Promise<void> {
  return runDisconnectCommand(deviceId, { apiBase });
}
