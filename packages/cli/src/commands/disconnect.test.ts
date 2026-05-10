// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';

vi.mock('../medal-connect/keychain.js', () => ({
  loadDeviceToken: vi.fn(),
  deleteDeviceToken: vi.fn(() => true),
}));

import { errorCodes, PilotError } from '../errors.js';
import { deleteDeviceToken, loadDeviceToken } from '../medal-connect/keychain.js';
import { runDisconnectCommand } from './disconnect.js';

describe('runDisconnectCommand', () => {
  it('calls /unpair with deviceId + token, deletes keychain on success', async () => {
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      deviceId: 'd1',
      workspaceId: 'w',
      doUrl: 'u',
      token: 'tok',
    });
    const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const out = vi.fn();
    const err = vi.fn();

    await runDisconnectCommand('d1', {
      apiBase: 'http://x',
      _fetch: fetchFn as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://x/api/medal-connect/unpair',
      expect.objectContaining({ method: 'POST' })
    );
    const callBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody).toEqual({ deviceId: 'd1', token: 'tok' });
    expect(deleteDeviceToken).toHaveBeenCalledWith('d1');
    expect(out.mock.calls.map((c) => c[0]).join('')).toContain('Disconnected d1');
  });

  it('throws DISCONNECT_NO_KEYCHAIN_RECORD when keychain lookup is null', async () => {
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const out = vi.fn();
    const err = vi.fn();

    const promise = runDisconnectCommand('missing', {
      _fetch: vi.fn() as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.DISCONNECT_NO_KEYCHAIN_RECORD,
    });
  });

  it('throws DISCONNECT_SERVER_ERROR on non-2xx', async () => {
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'u',
      token: 't',
    });
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    const out = vi.fn();
    const err = vi.fn();

    const promise = runDisconnectCommand('d', {
      _fetch: fetchFn as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.DISCONNECT_SERVER_ERROR,
    });
  });

  it('throws DISCONNECT_SERVER_ERROR when unpair fetch THROWS (Codex P2)', async () => {
    // Network rejection (offline, DNS failure, TLS error, connection reset)
    // before a Response exists must surface the typed disconnect error so
    // users see the consistent failure path, not raw `fetch failed`.
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'u',
      token: 't',
    });
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const out = vi.fn();
    const err = vi.fn();

    const promise = runDisconnectCommand('d', {
      _fetch: fetchFn as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.DISCONNECT_SERVER_ERROR,
    });
    expect(out.mock.calls.map((c) => c[0]).join('')).not.toContain('Disconnected');
  });

  it('throws DISCONNECT_UNPAIR_FAILED when server returns ok:false reason:auth', async () => {
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'u',
      token: 't',
    });
    const fetchFn = vi.fn(
      async () => new Response('{"ok":false,"reason":"auth"}', { status: 200 })
    );
    const out = vi.fn();
    const err = vi.fn();

    const promise = runDisconnectCommand('d', {
      _fetch: fetchFn as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.DISCONNECT_UNPAIR_FAILED,
      cause: 'auth',
    });
  });

  it('throws DISCONNECT_BAD_RESPONSE on non-JSON 2xx', async () => {
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'u',
      token: 't',
    });
    const fetchFn = vi.fn(async () => new Response('not json', { status: 200 }));
    const out = vi.fn();
    const err = vi.fn();

    const promise = runDisconnectCommand('d', {
      _fetch: fetchFn as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.DISCONNECT_BAD_RESPONSE,
    });
  });

  it('throws DISCONNECT_KEYCHAIN_DELETE_FAILED when keychain refuses deletion', async () => {
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'u',
      token: 't',
    });
    // Override deleteDeviceToken to fail just for this test.
    (deleteDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const out = vi.fn();
    const err = vi.fn();

    const promise = runDisconnectCommand('d', {
      _fetch: fetchFn as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.DISCONNECT_KEYCHAIN_DELETE_FAILED,
    });
    // Did NOT print "Disconnected" — that would be misleading since the
    // local credential was not actually removed.
    expect(out.mock.calls.map((c) => c[0]).join('')).not.toContain('Disconnected');
  });

  it('throws DISCONNECT_KEYCHAIN_DELETE_FAILED when keychain delete THROWS (Codex P2)', async () => {
    // @napi-rs/keyring's Entry.deletePassword() can either return false OR
    // throw an OS-level keychain error (locked, permission denied, etc.).
    // The throw path must surface the same typed PilotError as the
    // false-return path, with the underlying error attached as `cause` so
    // support has the OS message but the user-facing string stays consistent.
    (loadDeviceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      deviceId: 'd',
      workspaceId: 'w',
      doUrl: 'u',
      token: 't',
    });
    const osError = new Error('keychain locked');
    (deleteDeviceToken as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw osError;
    });

    const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const out = vi.fn();
    const err = vi.fn();

    const promise = runDisconnectCommand('d', {
      _fetch: fetchFn as unknown as typeof fetch,
      _stdout: out,
      _stderr: err,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.DISCONNECT_KEYCHAIN_DELETE_FAILED,
      cause: osError,
    });
    // Same guarantee as the false-return path: must NOT print "Disconnected"
    // because the local credential is still on disk.
    expect(out.mock.calls.map((c) => c[0]).join('')).not.toContain('Disconnected');
  });
});
