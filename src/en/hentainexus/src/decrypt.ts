const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];
const HOSTNAME = 'hentainexus.com';

/** Decrypts the reader's `initReader("...")` payload (an RC4-like stream keyed by its first 64 bytes). */
export function decryptData(encoded: string): string {
  const data = base64.decodeBytes(encoded);
  for (let i = 0; i < HOSTNAME.length; i++) data[i] = data[i]! ^ HOSTNAME.charCodeAt(i);
  const keyStream = data.subarray(0, 64);
  const ciphertext = data.subarray(64);
  let primeIdx = 0;
  for (let i = 0; i < 64; i++) {
    primeIdx ^= keyStream[i]!;
    for (let j = 0; j < 8; j++) primeIdx = primeIdx & 1 ? (primeIdx >>> 1) ^ 12 : primeIdx >>> 1;
  }
  primeIdx &= 7;
  const digest = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, key = 0; i < 256; i++) {
    key = (key + digest[i]! + keyStream[i % 64]!) % 256;
    [digest[i], digest[key]] = [digest[key]!, digest[i]!];
  }
  const q = PRIMES[primeIdx]!;
  const out: number[] = new Array(ciphertext.length);
  let k = 0;
  let n = 0;
  let p = 0;
  let xorKey = 0;
  for (let i = 0; i < ciphertext.length; i++) {
    k = (k + q) % 256;
    n = (p + digest[(n + digest[k]!) % 256]!) % 256;
    p = (p + k + digest[k]!) % 256;
    [digest[k], digest[n]] = [digest[n]!, digest[k]!];
    xorKey = digest[(n + digest[(k + digest[(xorKey + p) % 256]!) % 256]!) % 256]!;
    out[i] = ciphertext[i]! ^ xorKey;
  }
  return utf8.decode(out);
}
