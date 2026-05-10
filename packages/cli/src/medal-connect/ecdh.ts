// NOTE: Mirror of apps/convex/medalConnect/_internal/ecdh.ts in medal-monorepo.
// Both sides use Web Crypto P-256 + AES-GCM 256 to ECDH-seal the device token
// during pair flow. Keep them in sync until v1.1 extracts a shared package.

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface JwkPair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

export interface SealedEnvelope {
  ciphertext: string; // base64url
  iv: string; // base64url (12 bytes)
  senderPubkeyJwk: JsonWebKey;
}

function toB64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromB64Url(s: string): Uint8Array {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateKeyPairJwk(): Promise<JwkPair> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ]);
  const publicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicJwk, privateJwk };
}

async function importPubKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function importPrivKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveKey',
    'deriveBits',
  ]);
}

async function deriveAesKey(privJwk: JsonWebKey, pubJwk: JsonWebKey): Promise<CryptoKey> {
  const [priv, pub] = await Promise.all([importPrivKey(privJwk), importPubKey(pubJwk)]);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: pub },
    priv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * ECDH-seal `plaintext` for the recipient (`recipientPubJwk`) using `senderPrivJwk`.
 * The returned envelope includes the sender's pub JWK so the recipient can derive
 * the shared secret without out-of-band data.
 */
export async function sealForRecipient(
  recipientPubJwk: JsonWebKey,
  senderPrivJwk: JsonWebKey,
  plaintext: string
): Promise<SealedEnvelope> {
  const aesKey = await deriveAesKey(senderPrivJwk, recipientPubJwk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(plaintext));

  // Strip the private 'd' field to derive the sender's public JWK.
  const senderPubJwk: JsonWebKey = { ...senderPrivJwk };
  delete (senderPubJwk as { d?: string }).d;

  return {
    ciphertext: toB64Url(ct),
    iv: toB64Url(iv),
    senderPubkeyJwk: senderPubJwk,
  };
}

/**
 * Open a SealedEnvelope using the recipient's private key. Throws if the
 * key doesn't match (bad MAC) or if the envelope is malformed.
 */
export async function openSealed(
  envelope: SealedEnvelope,
  recipientPrivJwk: JsonWebKey
): Promise<string> {
  const aesKey = await deriveAesKey(recipientPrivJwk, envelope.senderPubkeyJwk);
  const iv = fromB64Url(envelope.iv);
  const ct = fromB64Url(envelope.ciphertext);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    aesKey,
    ct as unknown as ArrayBuffer
  );
  return dec.decode(pt);
}
