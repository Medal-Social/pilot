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
  const hostname = os.hostname();
  const platform: 'darwin' | 'linux' = process.platform === 'darwin' ? 'darwin' : 'linux';
  const createRes = await fetchFn(`${apiBase}/api/medal-connect/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hostname, os: platform, pubkeyJwk: cliKp.publicJwk }),
  });
  if (!createRes.ok) {
    throw new PilotError(errorCodes.CONNECT_PAIR_CREATE_FAILED, `HTTP ${createRes.status}`);
  }
  const { code, claimUrl } = (await createRes.json()) as { code: string; claimUrl: string };
  opts.onCode?.(code, claimUrl);

  // 3. Poll until claimed / expired / timeout.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const pollRes = await fetchFn(`${apiBase}/api/medal-connect/pair/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!pollRes.ok) continue;
    const data = (await pollRes.json()) as
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
    if (data.status === 'pending') continue;
    if (data.status === 'expired') throw new PilotError(errorCodes.CONNECT_PAIR_CODE_EXPIRED);
    if (data.status === 'not_found') throw new PilotError(errorCodes.CONNECT_PAIR_CODE_NOT_FOUND);

    // 4. Unseal the token.
    const sealed: SealedEnvelope = JSON.parse(data.sealedDeviceToken);
    const token = await openSealed(sealed, cliKp.privateJwk);

    // 5. Persist in keychain.
    storeDeviceToken({
      deviceId: data.deviceId,
      workspaceId: data.workspaceId,
      doUrl: data.doUrl,
      token,
    });

    return {
      deviceId: data.deviceId,
      workspaceId: data.workspaceId,
      doUrl: data.doUrl,
    };
  }
  throw new PilotError(errorCodes.CONNECT_PAIR_TIMEOUT);
}
