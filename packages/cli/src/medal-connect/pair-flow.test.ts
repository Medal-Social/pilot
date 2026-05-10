import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock keychain at module level — tests must not touch the real OS keychain.
vi.mock('./keychain', () => ({
  storeDeviceToken: vi.fn(),
}));

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
          const sealed = await sealForRecipient(cliPubkey!, cloudKp.privateJwk, TOKEN);
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
      throw new Error('unexpected ' + url);
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

  it('throws pair_create_failed on non-2xx pair create', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(
      runPairFlow({
        apiBase: 'http://x',
        fetchFn: fetchFn as unknown as typeof fetch,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow(/pair_create_failed/);
    expect(storeDeviceToken).not.toHaveBeenCalled();
  });

  it('throws pair_code_expired on expired status', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(JSON.stringify({ status: 'expired' }), { status: 200 });
    });
    await expect(
      runPairFlow({
        apiBase: 'http://x',
        fetchFn: fetchFn as unknown as typeof fetch,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow(/expired/);
  });

  it('throws pair_code_not_found when code is gone', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(JSON.stringify({ status: 'not_found' }), { status: 200 });
    });
    await expect(
      runPairFlow({
        apiBase: 'http://x',
        fetchFn: fetchFn as unknown as typeof fetch,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow(/not_found/);
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
          const sealed = await sealForRecipient(cliPubkey!, cloudKp.privateJwk, TOKEN);
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

  it('throws pair_timeout when polling never resolves', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
    });
    await expect(
      runPairFlow({
        apiBase: 'http://x',
        fetchFn: fetchFn as unknown as typeof fetch,
        pollIntervalMs: 1,
        timeoutMs: 50,
      })
    ).rejects.toThrow(/timeout/);
  });
});
