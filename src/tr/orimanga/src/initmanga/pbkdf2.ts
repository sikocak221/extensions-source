// PBKDF2-HMAC-SHA512 in plain JS (the sandbox's `crypto` has no SHA-512). 64-bit words are kept as
// [high, low] 32-bit halves.

const K = [
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b,
  0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242,
  0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe,
  0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
  0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc,
  0xbd41fbd4, 0x76f988da, 0x831153b5, 0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f,
  0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967,
  0x0a0e6e70, 0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b, 0xa2bfe8a1,
  0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218,
  0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8, 0x19a4c116, 0xb8d2d0c8, 0x1e376c08,
  0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
  0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814,
  0xa1f0ab72, 0x8cc70208, 0x1a6439ec, 0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915,
  0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f,
  0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c, 0x4cc5d4be,
  0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
];
const H0 = [
  0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f,
  0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
];

const W = new Int32Array(160);

/** One SHA-512 compression of the 128-byte block at `offset` into `h` (16 int32 halves). */
function compress(h: Int32Array, block: Uint8Array, offset: number): void {
  for (let i = 0; i < 32; i++) {
    const j = offset + i * 4;
    W[i] = (block[j]! << 24) | (block[j + 1]! << 16) | (block[j + 2]! << 8) | block[j + 3]!;
  }
  for (let i = 16; i < 80; i++) {
    // σ0 = rotr1 ^ rotr8 ^ shr7, σ1 = rotr19 ^ rotr61 ^ shr6
    let xh = W[(i - 15) * 2]!;
    let xl = W[(i - 15) * 2 + 1]!;
    const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
    const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
    xh = W[(i - 2) * 2]!;
    xl = W[(i - 2) * 2 + 1]!;
    const s1h = ((xh >>> 19) | (xl << 13)) ^ ((xl >>> 29) | (xh << 3)) ^ (xh >>> 6);
    const s1l = ((xl >>> 19) | (xh << 13)) ^ ((xh >>> 29) | (xl << 3)) ^ ((xl >>> 6) | (xh << 26));
    let lo = (s0l >>> 0) + (s1l >>> 0) + (W[(i - 7) * 2 + 1]! >>> 0) + (W[(i - 16) * 2 + 1]! >>> 0);
    const hi = s0h + s1h + W[(i - 7) * 2]! + W[(i - 16) * 2]! + Math.floor(lo / 0x100000000);
    lo >>>= 0;
    W[i * 2] = hi;
    W[i * 2 + 1] = lo;
  }
  let ah = h[0]!,
    al = h[1]!,
    bh = h[2]!,
    bl = h[3]!,
    ch = h[4]!,
    cl = h[5]!,
    dh = h[6]!,
    dl = h[7]!;
  let eh = h[8]!,
    el = h[9]!,
    fh = h[10]!,
    fl = h[11]!,
    gh = h[12]!,
    gl = h[13]!,
    hh = h[14]!,
    hl = h[15]!;
  for (let i = 0; i < 80; i++) {
    // Σ1(e) = rotr14 ^ rotr18 ^ rotr41
    const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
    const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
    const chh = (eh & fh) ^ (~eh & gh);
    const chl = (el & fl) ^ (~el & gl);
    let t1l = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K[i * 2 + 1]! >>> 0) + (W[i * 2 + 1]! >>> 0);
    const t1h = hh + S1h + chh + K[i * 2]! + W[i * 2]! + Math.floor(t1l / 0x100000000);
    t1l >>>= 0;
    // Σ0(a) = rotr28 ^ rotr34 ^ rotr39
    const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
    const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
    const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
    const majl = (al & bl) ^ (al & cl) ^ (bl & cl);
    let t2l = (S0l >>> 0) + (majl >>> 0);
    const t2h = S0h + majh + Math.floor(t2l / 0x100000000);
    t2l >>>= 0;
    hh = gh;
    hl = gl;
    gh = fh;
    gl = fl;
    fh = eh;
    fl = el;
    let nl = (dl >>> 0) + t1l;
    eh = (dh + t1h + Math.floor(nl / 0x100000000)) | 0;
    el = nl | 0;
    dh = ch;
    dl = cl;
    ch = bh;
    cl = bl;
    bh = ah;
    bl = al;
    nl = t1l + t2l;
    ah = (t1h + t2h + Math.floor(nl / 0x100000000)) | 0;
    al = nl | 0;
  }
  const add = (i: number, xh: number, xl: number) => {
    const lo = (h[i + 1]! >>> 0) + (xl >>> 0);
    h[i] = h[i]! + xh + Math.floor(lo / 0x100000000);
    h[i + 1] = lo;
  };
  add(0, ah, al);
  add(2, bh, bl);
  add(4, ch, cl);
  add(6, dh, dl);
  add(8, eh, el);
  add(10, fh, fl);
  add(12, gh, gl);
  add(14, hh, hl);
}

export function sha512(data: Uint8Array): Uint8Array {
  const h = Int32Array.from(H0);
  const padded = new Uint8Array(Math.ceil((data.length + 17) / 128) * 128);
  padded.set(data);
  padded[data.length] = 0x80;
  const bits = data.length * 8;
  const end = padded.length;
  padded[end - 4] = (bits >>> 24) & 0xff;
  padded[end - 3] = (bits >>> 16) & 0xff;
  padded[end - 2] = (bits >>> 8) & 0xff;
  padded[end - 1] = bits & 0xff;
  padded[end - 5] = Math.floor(bits / 0x100000000) & 0xff;
  for (let offset = 0; offset < end; offset += 128) compress(h, padded, offset);
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) {
    out[i * 4] = h[i]! >>> 24;
    out[i * 4 + 1] = (h[i]! >>> 16) & 0xff;
    out[i * 4 + 2] = (h[i]! >>> 8) & 0xff;
    out[i * 4 + 3] = h[i]! & 0xff;
  }
  return out;
}

/** A 64-byte message's final block (with SHA-512 padding for 128 + 64 bytes) compressed onto `state`. */
function finish64(state: Int32Array, message: Uint8Array): Uint8Array {
  const h = Int32Array.from(state);
  const block = new Uint8Array(128);
  block.set(message);
  block[64] = 0x80;
  block[126] = 0x06; // (128 + 64) * 8 = 1536 bits
  compress(h, block, 0);
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) {
    out[i * 4] = h[i]! >>> 24;
    out[i * 4 + 1] = (h[i]! >>> 16) & 0xff;
    out[i * 4 + 2] = (h[i]! >>> 8) & 0xff;
    out[i * 4 + 3] = h[i]! & 0xff;
  }
  return out;
}

function padState(key: Uint8Array, pad: number): Int32Array {
  const block = new Uint8Array(128);
  block.set(key);
  for (let i = 0; i < 128; i++) block[i]! ^= pad;
  const h = Int32Array.from(H0);
  compress(h, block, 0);
  return h;
}

/** PBKDF2-HMAC-SHA512. Async: it yields now and then, the sandbox stops code that runs > 2 s straight. */
export async function pbkdf2Sha512(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Promise<Uint8Array> {
  // HMAC with a fixed key: the key blocks are compressed once, each round then costs two compressions.
  const key = password.length > 128 ? sha512(password) : password;
  const inner = padState(key, 0x36);
  const outer = padState(key, 0x5c);
  const hmacFirst = (message: Uint8Array) => {
    const block = new Uint8Array(128 + message.length);
    const outerBlock = new Uint8Array(192);
    for (let i = 0; i < 128; i++) {
      block[i] = (key[i] ?? 0) ^ 0x36;
      outerBlock[i] = (key[i] ?? 0) ^ 0x5c;
    }
    block.set(message, 128);
    outerBlock.set(sha512(block), 128);
    return sha512(outerBlock);
  };
  const out = new Uint8Array(keyLength);
  for (let blockIndex = 1, written = 0; written < keyLength; blockIndex++) {
    const first = new Uint8Array(salt.length + 4);
    first.set(salt);
    first[salt.length] = blockIndex >>> 24;
    first[salt.length + 1] = (blockIndex >>> 16) & 0xff;
    first[salt.length + 2] = (blockIndex >>> 8) & 0xff;
    first[salt.length + 3] = blockIndex & 0xff;
    let u = hmacFirst(first);
    const t = Uint8Array.from(u);
    for (let i = 1; i < iterations; i++) {
      u = finish64(outer, finish64(inner, u));
      for (let j = 0; j < 64; j++) t[j]! ^= u[j]!;
      if (i % 300 === 0) await timers.sleep(0);
    }
    out.set(t.subarray(0, Math.min(64, keyLength - written)), written);
    written += 64;
  }
  return out;
}
