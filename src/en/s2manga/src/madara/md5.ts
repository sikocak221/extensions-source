// MD5 over bytes (the host's crypto.md5 only hashes text), for OpenSSL-style key derivation.
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5Bytes(input: number[]): number[] {
  const bytes = [...input, 0x80];
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLength = input.length * 8;
  for (let i = 0; i < 8; i++) bytes.push(Math.floor(bitLength / 2 ** (8 * i)) & 0xff);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const m: number[] = [];
    for (let i = 0; i < 16; i++) {
      const o = chunk + i * 4;
      m.push((bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16) | (bytes[o + 3]! << 24)) >>> 0);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const temp = d;
      d = c;
      c = b;
      const sum = (a + f + K[i]! + m[g]!) >>> 0;
      b = (b + ((sum << S[i]!) | (sum >>> (32 - S[i]!)))) >>> 0;
      a = temp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out: number[] = [];
  for (const word of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) out.push((word >>> (8 * i)) & 0xff);
  return out;
}
