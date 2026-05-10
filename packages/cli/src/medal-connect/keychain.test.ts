import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockStore = new Map<string, string>();
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
      return mockStore.get(this._key) ?? null;
    }
    deletePassword() {
      return mockStore.delete(this._key);
    }
  }
  return { Entry };
});

import { storeDeviceToken, loadDeviceToken, deleteDeviceToken } from './keychain';

beforeEach(() => mockStore.clear());

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
});
