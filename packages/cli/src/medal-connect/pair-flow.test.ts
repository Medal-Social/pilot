import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock keychain at module level — tests must not touch the real OS keychain.
vi.mock('./keychain', () => ({
  storeDeviceToken: vi.fn(),
}));

import { errorCodes, PilotError } from '../errors.js';
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

  it('forwards workspace slug into the pair-create body and the claim URL', async () => {
    let createBody: Record<string, unknown> | null = null;
    const onCode = vi.fn();
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith('/api/medal-connect/pair')) {
        createBody = body;
        return new Response(
          JSON.stringify({ code: '424242', claimUrl: 'http://medal.social/connect/424242' }),
          { status: 200 }
        );
      }
      if (url.endsWith('/api/medal-connect/pair/poll')) {
        // Stay pending forever; we don't care about the rest of the flow here.
        return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    });

    const promise = runPairFlow({
      apiBase: 'http://medal.social',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 1,
      timeoutMs: 30,
      workspace: 'acme-corp',
      onCode,
    });
    await expect(promise).rejects.toMatchObject({ code: errorCodes.CONNECT_PAIR_TIMEOUT });

    // The pair-create POST included the workspace slug.
    expect(createBody).toMatchObject({ workspaceSlug: 'acme-corp' });
    // The claim URL handed to the caller has the workspace slug appended as a
    // query param so the browser /connect/<code> page can pre-select it.
    expect(onCode).toHaveBeenCalledWith(
      '424242',
      'http://medal.social/connect/424242?workspace=acme-corp'
    );
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

  it('throws CONNECT_PAIR_CREATE_FAILED when pair-create fetch THROWS (Codex P2)', async () => {
    // Offline/DNS/TLS rejections during the single-shot pair-create must
    // surface the same typed PilotError as a non-2xx response — otherwise
    // they fall through program.ts as a raw `fetch failed`.
    const fetchFn = vi.fn(async () => {
      throw new Error('ENOTFOUND medal.social');
    });
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

  it('retries on thrown poll errors (network/DNS blip) and eventually succeeds (Codex P2)', async () => {
    // A thrown fetch is the common transient failure mode (network drop, DNS
    // hiccup). The polling loop must treat it the same as a non-2xx response
    // and continue retrying until timeoutMs is reached, otherwise a single
    // blip during a 5-minute pair window forces the user to restart.
    const cloudKp = await generateKeyPairJwk();
    const TOKEN = 'c'.repeat(64);
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
        // First poll throws — simulate a transient network failure.
        if (pollCount === 1) throw new Error('ECONNRESET');
        // Subsequent polls succeed with the claimed envelope.
        if (!sealedToken) {
          if (!cliPubkey) throw new Error('cliPubkey not set');
          const sealed = await sealForRecipient(cliPubkey, cloudKp.privateJwk, TOKEN);
          sealedToken = JSON.stringify(sealed);
        }
        return new Response(
          JSON.stringify({
            status: 'claimed',
            sealedDeviceToken: sealedToken,
            deviceId: 'd-throw',
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
      timeoutMs: 5_000,
    });
    expect(result.deviceId).toBe('d-throw');
    // Loop must have retried after the throw — pollCount >= 2.
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
