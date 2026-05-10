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

  it('rejects Windows (win32) with CONNECT_UNSUPPORTED_PLATFORM before pair-create (Codex P2)', async () => {
    // The cloud schema is strictly 'darwin' | 'linux'. Silently sending
    // os: 'linux' for win32 would mislabel Windows devices in the dashboard
    // and break OS-specific command routing. Until the cloud adds 'win32',
    // fail explicitly with a typed error instead of pairing-as-Linux.
    const fetchFn = vi.fn(async () => {
      throw new Error('fetch must not be called when platform is unsupported');
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
      _platform: 'win32',
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_UNSUPPORTED_PLATFORM,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(storeDeviceToken).not.toHaveBeenCalled();
  });

  it('forwards platform "darwin" verbatim in pair-create body', async () => {
    let createBody: Record<string, unknown> | null = null;
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith('/api/medal-connect/pair')) {
        createBody = body;
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 1,
      timeoutMs: 30,
      _platform: 'darwin',
    });
    await expect(promise).rejects.toMatchObject({ code: errorCodes.CONNECT_PAIR_TIMEOUT });
    expect(createBody).toMatchObject({ os: 'darwin' });
  });

  it('forwards platform "linux" verbatim in pair-create body', async () => {
    let createBody: Record<string, unknown> | null = null;
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith('/api/medal-connect/pair')) {
        createBody = body;
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 1,
      timeoutMs: 30,
      _platform: 'linux',
    });
    await expect(promise).rejects.toMatchObject({ code: errorCodes.CONNECT_PAIR_TIMEOUT });
    expect(createBody).toMatchObject({ os: 'linux' });
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

  it('throws CONNECT_PAIR_CREATE_FAILED on malformed (non-JSON) pair-create 2xx body (Codex P2)', async () => {
    // A 2xx response from an edge/proxy/captive-portal can return non-JSON
    // (HTML error page, empty body, plain text). `await createRes.json()` then
    // throws SyntaxError that bypasses the typed CONNECT_PAIR_CREATE_FAILED
    // path. Must surface the same PilotError as a non-2xx response.
    const fetchFn = vi.fn(async () => new Response('<!doctype html>oops', { status: 200 }));
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

  it('throws CONNECT_PAIR_CREATE_FAILED when pair-create 2xx body is missing required fields (Codex P2)', async () => {
    // Even valid JSON must contain code + claimUrl strings, otherwise the
    // caller would propagate `undefined` into onCode and the polling loop.
    // Map a successful-but-malformed response to the same typed error.
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ code: 123 }), { status: 200 }));
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

  it('passes a bounded AbortSignal to the pair-create request (Codex P2)', async () => {
    // The single-shot pair-create must be bounded so a stalled connection
    // (dead TCP, unresponsive proxy, hung TLS handshake) can't leave
    // `pilot connect` sitting at "Connecting..." forever. Verify that the
    // fetch init carries an AbortSignal.
    let seenSignal: AbortSignal | undefined;
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.signal) seenSignal = init.signal;
      return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 1,
      timeoutMs: 30,
    });
    await expect(promise).rejects.toMatchObject({ code: errorCodes.CONNECT_PAIR_TIMEOUT });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
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

  it('passes a bounded AbortSignal to each poll request (Codex P2)', async () => {
    // Each poll must be bounded by the remaining pair window so a stalled
    // fetch (dead TCP, hung TLS) cannot prevent the loop from honoring
    // timeoutMs. Verify by capturing the init.signal of every poll call.
    const seenSignals: AbortSignal[] = [];
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/medal-connect/pair')) {
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      }
      if (url.endsWith('/api/medal-connect/pair/poll')) {
        if (init.signal) seenSignals.push(init.signal);
        return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
      }
      throw new Error('unexpected');
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 1,
      timeoutMs: 30,
    });
    await expect(promise).rejects.toMatchObject({ code: errorCodes.CONNECT_PAIR_TIMEOUT });
    // At least one poll happened.
    expect(seenSignals.length).toBeGreaterThanOrEqual(1);
    // Every poll carried a signal — the fetch is bounded.
    for (const sig of seenSignals) {
      expect(sig).toBeInstanceOf(AbortSignal);
    }
  });

  it('treats malformed (non-JSON) poll 2xx responses as transient and keeps retrying (Codex P2)', async () => {
    // A 2xx with a non-JSON body (captive portal / CDN HTML page) must NOT
    // throw a raw SyntaxError or treat the response as claimed — the loop
    // should continue until either a recognised status arrives or the pair
    // window elapses. Verified by sending HTML on the first poll, then a
    // valid claimed envelope on the second.
    const cloudKp = await generateKeyPairJwk();
    const TOKEN = 'd'.repeat(64);
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
        if (pollCount === 1) {
          // Captive-portal / CDN HTML response with 200 status.
          return new Response('<!doctype html>oops', { status: 200 });
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
            deviceId: 'd-html',
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
    expect(result.deviceId).toBe('d-html');
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  it('treats rate_limited as transient and keeps polling until claimed (Codex P2)', async () => {
    // The cloud rate-limits per-code polls to thwart enumeration of the
    // 6-digit code space. A `rate_limited` status from the cloud must NOT
    // exit the loop — the next poll will succeed once the bucket refills.
    const cloudKp = await generateKeyPairJwk();
    const TOKEN = 'g'.repeat(64);
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
        if (pollCount === 1) {
          return new Response(JSON.stringify({ status: 'rate_limited' }), { status: 200 });
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
            deviceId: 'd-rl',
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
    expect(result.deviceId).toBe('d-rl');
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  it('skips poll responses with unknown status (backend rollout) and keeps retrying (Codex P2)', async () => {
    // If the backend introduces a new status the CLI doesn't recognise, the
    // poll loop must NOT crash and must NOT mistake it for claimed. Skip the
    // cycle and keep polling.
    const cloudKp = await generateKeyPairJwk();
    const TOKEN = 'e'.repeat(64);
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
        if (pollCount === 1) {
          return new Response(JSON.stringify({ status: 'rate_limited' }), { status: 200 });
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
            deviceId: 'd-unknown',
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
    expect(result.deviceId).toBe('d-unknown');
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  it('skips claimed-but-incomplete poll responses (missing required fields) and keeps retrying (Codex P2)', async () => {
    // A poll response that says claimed but is missing sealedDeviceToken /
    // deviceId / workspaceId / doUrl must NOT be unsealed — the cast would
    // pass undefined to JSON.parse and crash. Skip the cycle.
    const cloudKp = await generateKeyPairJwk();
    const TOKEN = 'f'.repeat(64);
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
        if (pollCount === 1) {
          // Missing sealedDeviceToken / deviceId / workspaceId / doUrl.
          return new Response(JSON.stringify({ status: 'claimed' }), { status: 200 });
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
            deviceId: 'd-incomplete',
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
    expect(result.deviceId).toBe('d-incomplete');
    expect(pollCount).toBeGreaterThanOrEqual(2);
    expect(storeDeviceToken).toHaveBeenCalledTimes(1);
  });

  it('throws CONNECT_PAIR_UNSEAL_FAILED when sealedDeviceToken is malformed JSON (Codex P2)', async () => {
    // The browser has already approved the pair at this point. A malformed
    // envelope (e.g. cloud↔CLI version skew or corrupted response) must NOT
    // crash the CLI with a raw SyntaxError; surface the typed error so the
    // user sees a clear retry message instead.
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(
        JSON.stringify({
          status: 'claimed',
          sealedDeviceToken: 'not-json{{',
          deviceId: 'd',
          workspaceId: 'w',
          doUrl: 'http://do',
        }),
        { status: 200 }
      );
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_PAIR_UNSEAL_FAILED,
    });
    expect(storeDeviceToken).not.toHaveBeenCalled();
  });

  it('throws CONNECT_PAIR_UNSEAL_FAILED when openSealed cannot decrypt (Codex P2)', async () => {
    // Even with valid envelope JSON, decryption can fail when the
    // ephemeral keys don't match (e.g. backend bug, replayed envelope).
    // Map to the typed error rather than letting a raw crypto exception
    // escape after the server has already paired the device.
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/medal-connect/pair'))
        return new Response(JSON.stringify({ code: 'c', claimUrl: 'u' }), { status: 200 });
      return new Response(
        JSON.stringify({
          status: 'claimed',
          // Valid JSON shape but won't decrypt — junk ciphertext + senderPubkeyJwk.
          sealedDeviceToken: JSON.stringify({
            ciphertext: 'aaaa',
            iv: 'bbbb',
            senderPubkeyJwk: { kty: 'EC', crv: 'P-256', x: 'aa', y: 'bb' },
          }),
          deviceId: 'd',
          workspaceId: 'w',
          doUrl: 'http://do',
        }),
        { status: 200 }
      );
    });
    const promise = runPairFlow({
      apiBase: 'http://x',
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 0,
    });
    await expect(promise).rejects.toBeInstanceOf(PilotError);
    await expect(promise).rejects.toMatchObject({
      code: errorCodes.CONNECT_PAIR_UNSEAL_FAILED,
    });
    expect(storeDeviceToken).not.toHaveBeenCalled();
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
