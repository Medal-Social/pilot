import { Entry } from '@napi-rs/keyring';

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

export function loadDeviceToken(deviceId: string): DeviceTokenRecord | null {
  const e = entry(deviceId);
  try {
    const raw = e.getPassword();
    if (!raw) return null;
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
