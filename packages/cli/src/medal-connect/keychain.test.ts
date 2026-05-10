import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = new Map<string, string>();
// Per-key behavior overrides for getPassword — lets a single test simulate an
// OS-level keychain read failure without affecting the rest of the suite.
const getPasswordOverrides = new Map<string, () => string | null>();
vi.mock('@napi-rs/keyring', () => {
  class Entry {
    private _key: string;
    constructor(service: string, key: string) {
      this._key = `${service}:${key}`;
    }
    setPassword(v: string) {
      mockStore.set(this._key, v);
    }
    getPassword() {
      const override = getPasswordOverrides.get(this._key);
      if (override) return override();
      return mockStore.get(this._key) ?? null;
    }
    deletePassword() {
      return mockStore.delete(this._key);
    }
  }
  return { Entry };
});

import { errorCodes, PilotError } from '../errors.js';
import { deleteDeviceToken, loadDeviceToken, storeDeviceToken } from './keychain';

beforeEach(() => {
  mockStore.clear();
  getPasswordOverrides.clear();
});

describe('keychain', () => {
  it('round-trips a token record', () => {
    storeDeviceToken({ deviceId: 'd1', workspaceId: 'ws1', doUrl: 'http://do', token: 'abc' });
    expect(loadDeviceToken('d1')).toEqual({
      deviceId: 'd1',
      workspaceId: 'ws1',
      doUrl: 'http://do',
      token: 'abc',
    });
  });

  it('returns null for missing record', () => {
    expect(loadDeviceToken('never')).toBeNull();
  });

  it('deletes a record', () => {
    storeDeviceToken({ deviceId: 'd1', workspaceId: 'ws1', doUrl: 'http://do', token: 'abc' });
    expect(deleteDeviceToken('d1')).toBe(true);
    expect(loadDeviceToken('d1')).toBeNull();
  });

  it('multiple records coexist by deviceId', () => {
    storeDeviceToken({ deviceId: 'a', workspaceId: 'w1', doUrl: 'u', token: 't1' });
    storeDeviceToken({ deviceId: 'b', workspaceId: 'w2', doUrl: 'u', token: 't2' });
    expect(loadDeviceToken('a')?.token).toBe('t1');
    expect(loadDeviceToken('b')?.token).toBe('t2');
  });

  it('throws CONNECT_KEYCHAIN_READ_FAILED when OS keychain read throws (Codex P2)', () => {
    // Simulate a locked keychain / unavailable secret service: getPassword
    // throws an OS-level error. The previous behaviour collapsed this into
    // null, which made `pilot disconnect` look like DISCONNECT_NO_KEYCHAIN_RECORD
    // and skip the server unpair. Must surface a typed read-failure instead.
    getPasswordOverrides.set('medal-connect:locked', () => {
      throw new Error('keychain item not unlocked');
    });
    try {
      loadDeviceToken('locked');
      throw new Error('expected loadDeviceToken to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PilotError);
      expect((e as PilotError).code).toBe(errorCodes.CONNECT_KEYCHAIN_READ_FAILED);
    }
  });

  it('returns null (not throw) when stored payload is corrupt JSON', () => {
    // A stored record that fails JSON.parse is treated as "no usable record"
    // so the caller can re-pair, distinct from an OS-level read failure.
    mockStore.set('medal-connect:corrupt', 'not-json{{');
    expect(loadDeviceToken('corrupt')).toBeNull();
  });
});
