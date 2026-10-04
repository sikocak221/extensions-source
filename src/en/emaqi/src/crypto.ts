// Client-side crypto for the viewer API: the site encrypts each chapter's image key to an RSA public key
// sent in the X-Hash header (RSA-OAEP, SHA-256), and the images with AES-GCM/CBC. The sandbox has none of
// RSA, key generation or GCM, so they live here. The key pair is fixed (nothing it protects is secret: the
// server only needs *a* public key, and the transport is TLS), which avoids generating a 2048-bit RSA key
// inside the sandbox.
import { sha256 } from './sha256';

/** SubjectPublicKeyInfo (DER, base64) of the key below. */
export const PUBLIC_KEY_SPKI =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv5oWYWafD/+ekayCbqtl7WBXeAePLDOEpbRMuCorZVAhQgt931j4O6Sa0cxihmTfoUXZlw8g1YZ84qF9d/jgeIMYCoznl1yXToh3uCEKLg+J4/JNjAm2kNDuzM3pMBy5F+nKFSdcCIaSMo4X2tka9LDUdyEcAi5fxt6do37dC0XbSPOW8wakApy8Arqrf8L0C7HqKoi3qBqRoHFzy0OyjunzJpKPzrN+jDTo2ZcFny11lS5KcNFWmL8wjjoKkwD1NCJz+59hnq7foI/2D7AVlOxFvy6KdYHwaNxFKcrtqg2m2PHHOLjHUxW8t3RqVks/HhXFp2Uk7/nKxj++MImZNwIDAQAB';

const N = BigInt(
  '0xbf9a1661669f0fff9e91ac826eab65ed605778078f2c3384a5b44cb82a2b655021420b7ddf58f83ba49ad1cc628664dfa145d9970f20d5867ce2a17d77f8e07883180a8ce7975c974e8877b8210a2e0f89e3f24d8c09b690d0eecccde9301cb917e9ca15275c088692328e17dad91af4b0d477211c022e5fc6de9da37edd0b45db48f396f306a4029cbc02baab7fc2f40bb1ea2a88b7a81a91a07173cb43b28ee9f326928fceb37e8c34e8d997059f2d75952e4a70d15698bf308e3a0a9300f5342273fb9f619eaedfa08ff60fb01594ec45bf2e8a7581f068dc4529caedaa0da6d8f1c738b8c75315bcb7746a564b3f1e15c5a76524eff9cac63fbe30899937',
);
const P = BigInt(
  '0xf65692e89e6a837b7badf62195b1ba85d4ed237431be4c94b3b7a62b379bf90711e1fafa7375a87a88a57392b1d65c2b6273bed1c26ede2254e41dd156b07c255335c11b986c6b34ba079528868effebea9209a864c70e09943042ec46ad3ae16e79edb19a9f723d09dc8c4be8483fe080409bafee77f7fffe60f4d6d466f54f',
);
const Q = BigInt(
  '0xc71deb40e96f7768a4d45156c44a4a7d7a9a6740f464ea930c4d7ba3f2cd5c4d06f4b444740f4a7175f845c53e244e9c1e9e7b3fff6a4096a7bf77b87eb71f9cdb5edd7d6dddb025b44a15eac964e6e36beb2b44dc4e1db19e6771fc9c5adcf827b8385279e5545d300fb69e3a8f75c7a00342df49e89c35e0ebd7447da9f399',
);
const D = BigInt(
  '0x1de6fa5f3118d9f256d8fd474de649fe05ef20b86d4bc4ae8afddc8b51697c62490e79a4a75ac742e7a991dc87f3d9825d34fd8469c4020eff268f757967ca0084d517b06de45d7aefb2b49c73eb96ccae0479284916aafb66e01dee74da216171adf6efde38aacbf5bd1617fafbaf0d491b9f8bf7470fddbab7bb7a6cae2ab7f2bfd9a3bdfa365a9fa092ed02b3c0ccf550d79d06498c6718f75832a537ef1ce2cdc281b7ddeac3f47d07d9002ce17f97ed681800969481c36724d8bb338e93abe63acb2c8152e9b6d54d3b66190463a9c0a67311f48affbafc7056f0da0f3b38ee0f16e16b8c414d6cf7032dad3fc354d19173606934b91ae2d57d31a33c41',
);

const KEY_BYTES = 256;
const HASH_BYTES = 32;

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  for (let e = exponent; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
  }
  return result;
}

const toBigInt = (bytes: Uint8Array) => {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + (hex || '0'));
};

function toBytes(value: bigint, length: number): Uint8Array {
  const hex = value.toString(16).padStart(length * 2, '0');
  return Uint8Array.from({ length }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

function mgf1(seed: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(length / HASH_BYTES) * HASH_BYTES);
  for (let counter = 0; counter * HASH_BYTES < length; counter++) {
    const input = new Uint8Array(seed.length + 4);
    input.set(seed);
    new DataView(input.buffer).setUint32(seed.length, counter);
    out.set(sha256(input), counter * HASH_BYTES);
  }
  return out.subarray(0, length);
}

/** RSA/ECB/OAEPWithSHA-256AndMGF1Padding decryption with the fixed key (empty label). */
export function rsaOaepDecrypt(cipher: Uint8Array): Uint8Array {
  if (cipher.length !== KEY_BYTES) throw new Error('Unexpected RSA block size');
  const c = toBigInt(cipher);
  // Chinese remainder theorem: two 1024-bit exponentiations instead of one 2048-bit.
  const m1 = modPow(c, D % (P - 1n), P);
  const m2 = modPow(c, D % (Q - 1n), Q);
  const qInv = modPow(Q, P - 2n, P);
  const h = (qInv * (((m1 - m2) % P) + P)) % P;
  const em = toBytes(m2 + h * Q, KEY_BYTES);
  if (toBigInt(em) >= N || em[0] !== 0) throw new Error('RSA decryption error');

  const seed = em.slice(1, 1 + HASH_BYTES);
  const block = em.slice(1 + HASH_BYTES);
  const seedMask = mgf1(block, HASH_BYTES);
  seed.forEach((_, i) => (seed[i]! ^= seedMask[i]!));
  const blockMask = mgf1(seed, block.length);
  block.forEach((_, i) => (block[i]! ^= blockMask[i]!));
  const labelHash = sha256(new Uint8Array());
  for (let i = 0; i < HASH_BYTES; i++) if (block[i] !== labelHash[i]) throw new Error('OAEP decoding error');
  let at = HASH_BYTES;
  while (at < block.length && block[at] === 0) at++;
  if (block[at] !== 1) throw new Error('OAEP decoding error');
  return block.slice(at + 1);
}

// ---- AES-GCM from AES-CTR ----------------------------------------------------------------------------

/** AES-CTR as the host offers it (big-endian counter over the whole 16-byte block). */
export type AesCtr = (data: Uint8Array, key: Uint8Array, iv: Uint8Array) => Uint8Array;

type HostAes = (data: Uint8Array, key: Uint8Array, options: { mode: 'cbc' | 'ctr'; iv: Uint8Array }) => Uint8Array;
// Typed locally: the test project sees Node's `crypto` global instead of the sandbox's.
const hostAes: HostAes = (data, key, options) =>
  (globalThis as unknown as { crypto: { aesDecrypt: HostAes } }).crypto.aesDecrypt(data, key, options);

const hostCtr: AesCtr = (data, key, iv) => hostAes(data, key, { mode: 'ctr', iv });

/** Multiplication in GF(2^128) (GCM bit order). */
function gfMultiply(x: bigint, y: bigint): bigint {
  const R = 0xe1n << 120n;
  let z = 0n;
  let v = y;
  for (let i = 127n; i >= 0n; i--) {
    if ((x >> i) & 1n) z ^= v;
    v = v & 1n ? (v >> 1n) ^ R : v >> 1n;
  }
  return z;
}

function ghash(h: bigint, data: Uint8Array): bigint {
  let y = 0n;
  for (let offset = 0; offset < data.length; offset += 16) {
    const block = new Uint8Array(16);
    block.set(data.subarray(offset, offset + 16));
    y = gfMultiply(y ^ toBigInt(block), h);
  }
  return y;
}

/**
 * AES-GCM decryption (`data` = ciphertext + 16-byte tag, any IV length). The tag is not verified. GCM is CTR
 * mode starting at inc32(J0), J0 being the IV (12 bytes) or GHASH of it (other lengths).
 */
export function aesGcmDecrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array, ctr: AesCtr = hostCtr): Uint8Array {
  let j0: Uint8Array;
  if (iv.length === 12) {
    j0 = new Uint8Array(16);
    j0.set(iv);
    j0[15] = 1;
  } else {
    const h = toBigInt(ctr(new Uint8Array(16), key, new Uint8Array(16)));
    const padded = new Uint8Array(Math.ceil(iv.length / 16) * 16 + 16);
    padded.set(iv);
    new DataView(padded.buffer).setUint32(padded.length - 4, iv.length * 8);
    j0 = toBytes(ghash(h, padded), 16);
  }
  const counter = j0.slice();
  const view = new DataView(counter.buffer);
  view.setUint32(12, (view.getUint32(12) + 1) >>> 0);
  return ctr(data.subarray(0, data.length - 16), key, counter);
}

/** The site's image encryption: `02 xx` + 16-byte IV + AES-GCM, or a 16-byte IV + AES-CBC (PKCS#7). */
export function decryptImage(bytes: Uint8Array, key: Uint8Array): Uint8Array {
  if (bytes[0] === 2) return aesGcmDecrypt(bytes.subarray(18), key, bytes.subarray(2, 18));
  return hostAes(bytes.subarray(16), key, { mode: 'cbc', iv: bytes.subarray(0, 16) });
}
