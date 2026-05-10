import { Entry } from '@napi-rs/keyring';
import { errorCodes, PilotError } from '../errors.js';

const SERVICE = 'medal-connect';

export interface DeviceTokenRecord {
  deviceId: string;
  workspaceId: string;
  doUrl: string;
  token: string; // raw 64-char hex; never logged
}

function entry(deviceId: string): Entry {
  return new Entry(SERVICE, deviceId);
}

export function storeDeviceToken(record: DeviceTokenRecord): void {
  // Pack the metadata (deviceId, workspaceId, doUrl, token) into one string.
  // Format: JSON. Keychain stores opaque strings; on macOS this lands as a generic password item.
  entry(record.deviceId).setPassword(JSON.stringify(record));
}

/**
 * Look up a stored device token.
 *
 * Returns `null` when the record genuinely does not exist (or is corrupted
 * beyond JSON.parse) and throws a typed `CONNECT_KEYCHAIN_READ_FAILED`
 * `PilotError` when the OS keychain itself rejects the read (locked, secret
 * service unavailable, permission denied, etc.).
 *
 * Distinguishing the two matters for `pilot disconnect`: if the keychain is
 * unreadable we must NOT collapse to `DISCONNECT_NO_KEYCHAIN_RECORD` and tell
 * the user no device exists, because the local credential may still be on
 * disk and the server-side pair is still active. The caller surfaces the
 * read-failure error so the user unlocks the keychain and retries instead of
 * silently bypassing the server unpair (Codex P2).
 */
export function loadDeviceToken(deviceId: string): DeviceTokenRecord | null {
  const e = entry(deviceId);
  let raw: string | null;
  try {
    raw = e.getPassword();
  } catch (err) {
    throw new PilotError(
      errorCodes.CONNECT_KEYCHAIN_READ_FAILED,
      (err as Error).message ?? 'keychain read failed'
    );
  }
  if (!raw) return null;
  // A corrupted record (not valid JSON) is treated as "no usable record" so
  // the caller can re-pair; that is distinct from a keychain-level failure.
  try {
    return JSON.parse(raw) as DeviceTokenRecord;
  } catch {
    return null;
  }
}

export function deleteDeviceToken(deviceId: string): boolean {
  return entry(deviceId).deletePassword();
}

export function listDeviceIds(): string[] {
  // @napi-rs/keyring doesn't expose an enumerate API.
  // Track deviceIds in a separate registry file (~/.medal/connect/devices.json).
  // For simplicity: return [] and rely on user to know their deviceId.
  // v1.1 may add a registry.
  return [];
}
