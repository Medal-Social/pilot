import { describe, expect, it } from 'vitest';
import { generateKeyPairJwk, openSealed, sealForRecipient } from './ecdh';

describe('CLI ECDH P-256 + AES-GCM', () => {
  it('round-trips a sealed message between two keypairs', async () => {
    const cli = await generateKeyPairJwk();
    const cloud = await generateKeyPairJwk();
    const sealed = await sealForRecipient(cli.publicJwk, cloud.privateJwk, 'device-token');
    const opened = await openSealed(sealed, cli.privateJwk);
    expect(opened).toBe('device-token');
  });

  it('opening with wrong recipient private key fails', async () => {
    const cli = await generateKeyPairJwk();
    const cloud = await generateKeyPairJwk();
    const wrong = await generateKeyPairJwk();
    const sealed = await sealForRecipient(cli.publicJwk, cloud.privateJwk, 'tok');
    await expect(openSealed(sealed, wrong.privateJwk)).rejects.toThrow();
  });

  it('sealed payload contains base64url ciphertext + iv + senderPubkeyJwk', async () => {
    const cli = await generateKeyPairJwk();
    const cloud = await generateKeyPairJwk();
    const sealed = await sealForRecipient(cli.publicJwk, cloud.privateJwk, 'tok');
    expect(sealed.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed.iv).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed.senderPubkeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect((sealed.senderPubkeyJwk as Record<string, unknown>).d).toBeUndefined();
  });

  it('different invocations produce different ciphertexts (random iv)', async () => {
    const cli = await generateKeyPairJwk();
    const cloud = await generateKeyPairJwk();
    const a = await sealForRecipient(cli.publicJwk, cloud.privateJwk, 'tok');
    const b = await sealForRecipient(cli.publicJwk, cloud.privateJwk, 'tok');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('handles 32-byte hex tokens (the device token format)', async () => {
    const cli = await generateKeyPairJwk();
    const cloud = await generateKeyPairJwk();
    const token = 'a'.repeat(64);
    const sealed = await sealForRecipient(cli.publicJwk, cloud.privateJwk, token);
    expect(await openSealed(sealed, cli.privateJwk)).toBe(token);
  });

  it('cross-runtime: a CLI keypair can open a token sealed by a Convex-side keypair', async () => {
    // Both sides use the same Web Crypto primitives. This test demonstrates the
    // CLI side can open envelopes minted by an "Convex" side (simulated locally).
    const cliKp = await generateKeyPairJwk();
    const cloudKp = await generateKeyPairJwk();
    // "Cloud" side seals.
    const sealed = await sealForRecipient(
      cliKp.publicJwk,
      cloudKp.privateJwk,
      'cross-runtime-secret'
    );
    // "CLI" side opens.
    const opened = await openSealed(sealed, cliKp.privateJwk);
    expect(opened).toBe('cross-runtime-secret');
  });
});
