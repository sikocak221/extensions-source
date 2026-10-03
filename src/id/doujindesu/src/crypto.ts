// Doujindesu API answers are {"_enc_resp_": hex}. No sandbox globals here: the tests use it too.
// XOR with a key derived from a salt and the current hour.
const SALT = 'doujindesu-scrapers-cannot-read-this-super-secret-salt-2026-v2';

function hourKey(hour: number): string {
  const text = `${SALT}_${hour}`;
  let a = 0;
  for (let i = 0; i < text.length; i++) a = ((a << 5) - a + text.charCodeAt(i)) | 0;
  let l = a !== 0 ? Math.abs(a) : 123456789;
  let key = '';
  for (let i = 0; i < 32; i++) {
    l = (l * 1664525 + 1013904223) % 4294967296;
    key += String.fromCharCode(33 + (l % 93));
  }
  return key;
}

function xorDecode(hex: string, key: string): string {
  let d = 42;
  let out = '';
  for (let i = 0; i * 2 < hex.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) continue;
    out += String.fromCharCode((byte ^ key.charCodeAt(i % key.length) ^ (i * 13) ^ d) & 0xff);
    d = (d + byte) % 256;
  }
  return out;
}

export function decrypt(hex: string): string {
  const hour = Math.floor(Date.now() / 3_600_000);
  for (const h of [hour, hour - 1, hour + 1]) {
    try {
      const json = decodeURIComponent(xorDecode(hex, hourKey(h)).replace(/\+/g, ' '));
      JSON.parse(json);
      return json;
    } catch {
      // Try the neighbouring hour (clock skew).
    }
  }
  throw new Error('Decryption failed');
}
