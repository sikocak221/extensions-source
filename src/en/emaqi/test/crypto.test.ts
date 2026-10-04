import { constants, createCipheriv, createDecipheriv, publicEncrypt, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PUBLIC_KEY_SPKI, aesGcmDecrypt, rsaOaepDecrypt } from '../src/crypto';

// Node's AES-CTR stands in for the host's `crypto.aesDecrypt(…, { mode: 'ctr' })`.
const ctr = (data: Uint8Array, key: Uint8Array, iv: Uint8Array) => {
  const cipher = createCipheriv(`aes-${key.length * 8}-ctr`, key, iv);
  return new Uint8Array(Buffer.concat([cipher.update(data), cipher.final()]));
};

describe('emaqi crypto', () => {
  it('decrypts RSA-OAEP (SHA-256) data made for the public key', () => {
    const key = randomBytes(32);
    const publicKey = `-----BEGIN PUBLIC KEY-----\n${PUBLIC_KEY_SPKI}\n-----END PUBLIC KEY-----`;
    const encrypted = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      key,
    );
    expect(Buffer.from(rsaOaepDecrypt(new Uint8Array(encrypted)))).toEqual(key);
  });

  for (const [ivLength, keyLength] of [
    [16, 32],
    [16, 16],
    [12, 32],
    [20, 24],
  ] as const) {
    it(`decrypts AES-GCM with a ${ivLength}-byte IV and a ${keyLength}-byte key`, () => {
      const key = randomBytes(keyLength);
      const iv = randomBytes(ivLength);
      const plain = randomBytes(1000);
      const cipher = createCipheriv(`aes-${keyLength * 8}-gcm` as 'aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
      expect(
        Buffer.from(aesGcmDecrypt(new Uint8Array(encrypted), new Uint8Array(key), new Uint8Array(iv), ctr)),
      ).toEqual(plain);
      // Same data through Node's own GCM, to be sure the test is meaningful.
      const decipher = createDecipheriv(`aes-${keyLength * 8}-gcm` as 'aes-256-gcm', key, iv);
      decipher.setAuthTag(encrypted.subarray(-16));
      expect(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()])).toEqual(plain);
    });
  }
});
