import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock keychain at module level — tests must not touch the real OS keychain.
vi.mock('./keychain', () => ({
  storeDeviceToken: vi.fn(),
}));

import { PilotError, errorCodes } from '../errors.js';
import { generateKeyPairJwk, sealForRecipient } from './ecdh';
import { storeDeviceToken } from './keychain';
import { runPairFlow } from './pair-flow';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runPairFlow', () => {
  it('orchestrates create → poll → unseal → store', async () => {
    const onCode = vi.fn();
    const cloudKp = await generateKeyPairJwk();
    const TOKEN = 'a'.repeat(64);
    let cliPubkey: JsonWebKey | null = null;
    let pollCount = 0;
    let sealedToken: string | null = null;

    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith('/api/medal-connect/pair')) {
        cliPubkey = body.pubkeyJwk;
        return new Response(
          JSON.stringify({ code: '123456', claimUrl: 'http://medal.social/connect/123456' }),
          { status: 200 }
        );
      }
      if (url.endsWith('/api/medal-connect/pair/poll')) {
        pollCount += 1;
        if (pollCount < 2) {
          return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
        }
        if (!sealedToken) {
          if (!cliPubkey) throw new Error('cliPubkey not set');
          const sealed = await sealForRecipient(cliPubkey, cloudKp.privateJwk, TOKEN);
          sealedToken = JSON.stringify(sealed);
        }
        return new Response(
          JSON.stringify({
            status: 'claimed',
            sealedDeviceToken: sealedToken,
            deviceId: 'd-x',
            workspaceId: 'ws-x',
            doUrl: 'http://do',
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await runPairFlow({
      apiBase: 'http://medal.social',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
      onCode,
    });
    expect(result).toEqual({ deviceId: 'd-x', workspaceId: 'ws-x', doUrl: 'http://do' });
    expect(onCode).toHaveBeenCalledWith('123456', expect.stringContaining('123456'));
    expect(storeDeviceToken).toHaveBeenCalledWith({
      deviceId: 'd-x',
      workspaceId: 'ws-x',
      doUrl: 'http://do',
      token: TOKEN,
    });
  });

  it('throws CONNECT_PAIR_CREATE_FAILED on non-2xx pair create', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_PAIR_CREATE_FAILED,
    });
    expect(storeDeviceToken).not.toHaveBeenCalled();
  });

  it('throws CONNECT_PAIR_CODE_EXPIRED on expired status', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(JSON.stringify({ status: 'expired' }), { status: 200 });
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_PAIR_CODE_EXPIRED,
    });
  });

  it('throws CONNECT_PAIR_CODE_NOT_FOUND when code is gone', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(JSON.stringify({ status: 'not_found' }), { status: 200 });
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_PAIR_CODE_NOT_FOUND,
    });
  });

  it('retries on transient poll errors (non-2xx) and eventually succeeds', async () => {
    const cloudKp = await generateKeyPairJwk();
    const TOKEN = 'b'.repeat(64);
    let cliPubkey: JsonWebKey | null = null;
    let pollCount = 0;
    let sealedToken: string | null = null;

    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith('/api/medal-connect/pair')) {
        cliPubkey = body.pubkeyJwk;
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      }
      if (url.endsWith('/api/medal-connect/pair/poll')) {
        pollCount += 1;
        if (pollCount === 1) return new Response('boom', { status: 503 });
        if (!sealedToken) {
          if (!cliPubkey) throw new Error('cliPubkey not set');
          const sealed = await sealForRecipient(cliPubkey, cloudKp.privateJwk, TOKEN);
          sealedToken = JSON.stringify(sealed);
        }
        return new Response(
          JSON.stringify({
            status: 'claimed',
            sealedDeviceToken: sealedToken,
            deviceId: 'd',
            workspaceId: 'w',
            doUrl: 'http://do',
          }),
          { status: 200 }
        );
      }
      throw new Error('unexpected');
    });

    const result = await runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
    });
    expect(result.deviceId).toBe('d');
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  it('throws CONNECT_PAIR_TIMEOUT when polling never resolves', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 1,
      timeoutMs: 50,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_PAIR_TIMEOUT,
    });
  });
});
