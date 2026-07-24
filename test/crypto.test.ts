import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.MCP_BASE_URL ??= 'http://localhost:3000';
  process.env.MS_CLIENT_ID ??= 'test-client-id';
  process.env.MS_CLIENT_SECRET ??= 'test-client-secret';
  process.env.TOKEN_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
});

describe('crypto', () => {
  it('round-trips plaintext through encrypt/decrypt', async () => {
    const { encrypt, decrypt } = await import('../src/crypto.js');
    const plaintext = 'a very secret refresh token';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const { encrypt } = await import('../src/crypto.js');
    expect(encrypt('same input')).not.toBe(encrypt('same input'));
  });

  it('rejects a tampered payload', async () => {
    const { encrypt, decrypt } = await import('../src/crypto.js');
    const encrypted = encrypt('sensitive').split(':');
    encrypted[2] = Buffer.from('tampered-ciphertext').toString('base64');
    expect(() => decrypt(encrypted.join(':'))).toThrow();
  });
});
