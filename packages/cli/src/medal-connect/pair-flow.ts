import os from 'node:os';
import { errorCodes, PilotError } from '../errors.js';
import { generateKeyPairJwk, openSealed, type SealedEnvelope } from './ecdh.js';
import { storeDeviceToken } from './keychain.js';

const DEFAULT_API_BASE = 'https://medal.social';

export interface PairFlowOptions {
  apiBase?: string;
  fetchFn?: typeof fetch;
  onCode?: (code: string, claimUrl: string) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
  /**
   * Advisory workspace slug — forwarded to the pair-create API and the claim
   * URL so the approval page can pre-select the workspace. The user still
   * confirms (or overrides) in the browser.
   */
  workspace?: string;
  /**
   * Test seam: override `process.platform` so platform-specific behavior
   * (e.g. Windows being rejected with CONNECT_UNSUPPORTED_PLATFORM) can be
   * exercised without `vi.stubGlobal` / `Object.defineProperty` hacks.
   * Production callers should leave this unset.
   */
  _platform?: NodeJS.Platform;
}

export interface PairFlowResult {
  deviceId: string;
  workspaceId: string;
  doUrl: string;
}

/**
 * Run the full pair flow on the agent (CLI) side.
 *
 *   1. Generate an ephemeral ECDH P-256 keypair.
 *   2. POST /api/medal-connect/pair to create a 6-digit code; receive {code, claimUrl}.
 *   3. Surface the code via onCode (caller decides whether to print, open browser, etc).
 *   4. Poll /api/medal-connect/pair/poll once per pollIntervalMs until claimed or timeout.
 *   5. ECDH-unseal the device token using the CLI's private key.
 *   6. Persist the token + deviceId + workspaceId + doUrl in the OS keychain.
 *   7. Return the pair result; the caller wires up the WebSocket.
 *
 * Throws on: pair_create_failed, pair_code_expired, pair_code_not_found, pair_timeout.
 */
export async function runPairFlow(opts: PairFlowOptions = {}): Promise<PairFlowResult> {
  const apiBase = opts.apiBase ?? DEFAULT_API_BASE;
  const fetchFn = opts.fetchFn ?? fetch;
  const pollMs = opts.pollIntervalMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  // 1. Generate ephemeral ECDH keypair.
  const cliKp = await generateKeyPairJwk();

  // 2. Create the pair code.
  //
  // The cloud schema for the pair-create body strictly accepts
  // `os: 'darwin' | 'linux'`. Silently mapping any non-darwin platform to
  // 'linux' (the previous behavior) would mislabel Windows devices in the
  // dashboard and break OS-specific command routing. Until the cloud adds
  // 'win32' (and friends) to the accepted set, fail explicitly here with a
  // typed error so the user sees a clear message instead of pairing as Linux
  // (Codex P2 'Send win32 or reject Windows').
  const rawPlatform = opts._platform ?? process.platform;
  let platform: 'darwin' | 'linux';
  if (rawPlatform === 'darwin') {
    platform = 'darwin';
  } else if (rawPlatform === 'linux') {
    platform = 'linux';
  } else {
    throw new PilotError(errorCodes.CONNECT_UNSUPPORTED_PLATFORM, rawPlatform);
  }
  const hostname = os.hostname();
  const createBody: Record<string, unknown> = {
    hostname,
    os: platform,
    pubkeyJwk: cliKp.publicJwk,
  };
  if (opts.workspace) createBody.workspaceSlug = opts.workspace;
  // Pair-create is a single-shot request, not part of the polling loop, so a
  // thrown fetch (offline, DNS failure, TLS error) must be mapped to the same
  // typed CONNECT_PAIR_CREATE_FAILED error used for non-2xx responses —
  // otherwise it falls through `program.ts` as a raw `fetch failed` despite
  // the command having a dedicated user-facing message that mentions the
  // network. Attach the underlying message as detail for support diagnostics
  // (Codex P2).
  //
  // Bound the request with an AbortController so a stalled connection (dead
  // TCP, unresponsive proxy, hung TLS handshake) can't leave `pilot connect`
  // sitting at "Connecting..." forever. The polling loop already enforces
  // `timeoutMs` per poll; the create request gets the SAME budget so the
  // total CONNECT_PAIR_CREATE_FAILED window is bounded by the pair window
  // (the original timeoutMs is the user's full attention budget — once the
  // create cannot complete inside it, the pair would be useless anyway)
  // (Codex P2 'Bound the initial pair-create request').
  const createAc = new AbortController();
  const createAbortTimer = setTimeout(() => createAc.abort(), timeoutMs);
  let createRes: Response;
  try {
    createRes = await fetchFn(`${apiBase}/api/medal-connect/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody),
      signal: createAc.signal,
    });
  } catch (e) {
    throw new PilotError(
      errorCodes.CONNECT_PAIR_CREATE_FAILED,
      (e as Error).message ?? 'network error'
    );
  } finally {
    clearTimeout(createAbortTimer);
  }
  if (!createRes.ok) {
    throw new PilotError(errorCodes.CONNECT_PAIR_CREATE_FAILED, `HTTP ${createRes.status}`);
  }
  // A 2xx response can still carry a non-JSON body (HTML error page from a
  // captive portal / proxy / CDN edge) or be missing the expected fields. A
  // raw `await createRes.json()` followed by an unchecked cast would either
  // throw a `SyntaxError` that bypasses the typed CONNECT_PAIR_CREATE_FAILED
  // path, or hand `undefined` values to `onCode` and the polling loop. Wrap
  // both parsing and shape validation here so any malformed-but-2xx response
  // surfaces the same user-facing error as a non-2xx response (Codex P2
  // 'Map malformed pair-create responses').
  let code: string;
  let claimUrl: string;
  try {
    const parsed = (await createRes.json()) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { code?: unknown }).code !== 'string' ||
      typeof (parsed as { claimUrl?: unknown }).claimUrl !== 'string'
    ) {
      throw new Error('malformed pair-create response: missing code or claimUrl');
    }
    code = (parsed as { code: string }).code;
    claimUrl = (parsed as { claimUrl: string }).claimUrl;
  } catch (e) {
    throw new PilotError(
      errorCodes.CONNECT_PAIR_CREATE_FAILED,
      (e as Error).message ?? 'malformed response'
    );
  }
  // Append ?workspace=<slug> so the browser /connect/<code> page can
  // pre-select the workspace selector. Cloud-side claimUrl already points at
  // the right environment per MEDAL_CONNECT_PAIR_BASE_URL.
  const finalClaimUrl = opts.workspace
    ? `${claimUrl}?workspace=${encodeURIComponent(opts.workspace)}`
    : claimUrl;
  opts.onCode?.(code, finalClaimUrl);

  // 3. Poll until claimed / expired / timeout.
  //
  // A thrown fetch (network blip, DNS hiccup, transient TLS error) used to
  // exit the loop and force the user to restart `pilot connect` and approve
  // a new code, even though the original claim could still complete inside
  // `timeoutMs`. Treat fetch rejections the same as non-2xx responses:
  // continue retrying until the timeout window elapses (Codex P2).
  //
  // Each poll is also bounded by the remaining pair window via AbortController.
  // Without the per-request abort, a stalled fetch (dead TCP, proxy that never
  // returns a response, hung TLS handshake) can hang indefinitely without ever
  // re-checking the loop's `Date.now() - start < timeoutMs` condition,
  // breaking the advertised 5-minute pair window and the
  // `CONNECT_PAIR_TIMEOUT` contract (Codex P2 'Bound each poll request by the
  // pair timeout'). We abort the fetch the moment the pair window expires;
  // the loop condition then exits and throws CONNECT_PAIR_TIMEOUT.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const remainingMs = timeoutMs - (Date.now() - start);
    if (remainingMs <= 0) break;
    const ac = new AbortController();
    const abortTimer = setTimeout(() => ac.abort(), remainingMs);
    let pollRes: Response;
    try {
      pollRes = await fetchFn(`${apiBase}/api/medal-connect/pair/poll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: ac.signal,
      });
    } catch {
      continue; // transient or aborted — loop condition decides next step
    } finally {
      clearTimeout(abortTimer);
    }
    if (!pollRes.ok) continue;
    // A 2xx poll response can still carry a non-JSON body (HTML error page
    // from a captive portal / proxy / CDN edge), be missing the `status`
    // field, or carry a status the CLI doesn't recognise (added in a backend
    // rollout). An unchecked `await pollRes.json()` followed by a cast would
    // either throw a raw SyntaxError that exits the loop and forces the user
    // to restart, or fall through every status check and try to unseal an
    // `undefined` sealedDeviceToken as if the pair were claimed. Treat any
    // malformed-but-2xx response the same as a non-2xx response: log nothing,
    // continue retrying until the pair window elapses (Codex P2 'Validate
    // poll responses before treating them as claimed').
    let data:
      | { status: 'pending' }
      | { status: 'expired' }
      | { status: 'not_found' }
      | {
          status: 'claimed';
          sealedDeviceToken: string;
          deviceId: string;
          workspaceId: string;
          doUrl: string;
        };
    try {
      const parsed = (await pollRes.json()) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }
      const status = (parsed as { status?: unknown }).status;
      // `rate_limited` is treated as transient: the cloud-side rate limiter
      // throttles repeat polls of the same code to thwart enumeration of
      // the 6-digit pair-code space (Codex P2 cloud-side fix). The CLI's
      // 1Hz polling sits well inside the per-code budget under normal
      // operation; an unexpectedly busy connection from this device just
      // means the next poll will succeed once the bucket refills. Keep
      // looping until the pair window elapses.
      if (status === 'rate_limited') {
        continue;
      }
      if (status === 'pending' || status === 'expired' || status === 'not_found') {
        data = { status } as
          | { status: 'pending' }
          | { status: 'expired' }
          | { status: 'not_found' };
      } else if (status === 'claimed') {
        const obj = parsed as Record<string, unknown>;
        if (
          typeof obj.sealedDeviceToken !== 'string' ||
          typeof obj.deviceId !== 'string' ||
          typeof obj.workspaceId !== 'string' ||
          typeof obj.doUrl !== 'string'
        ) {
          // Claimed shape is missing required fields; skip this poll cycle.
          continue;
        }
        data = {
          status: 'claimed',
          sealedDeviceToken: obj.sealedDeviceToken,
          deviceId: obj.deviceId,
          workspaceId: obj.workspaceId,
          doUrl: obj.doUrl,
        };
      } else {
        // Unknown / new status — backend rollout. Skip; the loop's timeout
        // (or a subsequent recognised status) decides the outcome.
        continue;
      }
    } catch {
      // JSON.parse failed (HTML/empty body). Treat the same as transient
      // poll failure and keep retrying until the pair window elapses.
      continue;
    }
    if (data.status === 'pending') continue;
    if (data.status === 'expired') throw new PilotError(errorCodes.CONNECT_PAIR_CODE_EXPIRED);
    if (data.status === 'not_found') throw new PilotError(errorCodes.CONNECT_PAIR_CODE_NOT_FOUND);

    // 4. Unseal the token.
    const sealed: SealedEnvelope = JSON.parse(data.sealedDeviceToken);
    const token = await openSealed(sealed, cliKp.privateJwk);

    // 5. Persist in keychain. Map any throw (locked macOS keychain,
    //    unavailable Linux secret service, permission revoked) to the
    //    typed CONNECT_KEYCHAIN_LOST_TOKEN error so connect.ts surfaces a
    //    user-friendly message instead of a raw Error stack.
    try {
      storeDeviceToken({
        deviceId: data.deviceId,
        workspaceId: data.workspaceId,
        doUrl: data.doUrl,
        token,
      });
    } catch (e) {
      throw new PilotError(
        errorCodes.CONNECT_KEYCHAIN_LOST_TOKEN,
        (e as Error).message ?? data.deviceId
      );
    }

    return {
      deviceId: data.deviceId,
      workspaceId: data.workspaceId,
      doUrl: data.doUrl,
    };
  }
  throw new PilotError(errorCodes.CONNECT_PAIR_TIMEOUT);
}
