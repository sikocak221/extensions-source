// Port of Tachiyomi's VrfSigner: three byte-substitution stages, then URL-safe base64.
const TABLE_1 =
  'yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==';
const KEY_1 = '0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA=';
const TABLE_2 =
  'IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==';
const KEY_2 = 'AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ==';
const TABLE_3 =
  'NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ==';
const KEY_3 = 'DELOJgPsVaCcblDtTGMdHzM=';

const STAGES: [string, string, number][] = [
  [TABLE_1, KEY_1, 0x5a],
  [TABLE_2, KEY_2, 0x35],
  [TABLE_3, KEY_3, 0xba],
];

let decoded: { table: Uint8Array; key: Uint8Array; iv: number }[] | undefined;

function stages() {
  decoded ??= STAGES.map(([table, key, iv]) => ({
    table: base64.decodeBytes(table),
    key: base64.decodeBytes(key),
    iv,
  }));
  return decoded;
}

/** `path` is the api path without the `/api` prefix, with the sorted query (`/titles?a[0]=1&b=2`). */
export function sign(path: string): string {
  let data = Uint8Array.from(utf8.encode(path));
  for (const { table, key, iv } of stages()) {
    const out = new Uint8Array(data.length);
    let prev = iv;
    for (let i = 0; i < data.length; i++) {
      prev = table[(data[i]! ^ key[i % key.length]! ^ prev) & 0xff]!;
      out[i] = prev;
    }
    data = out;
  }
  return base64.encodeBytes(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Appends the `vrf` parameter to an api url. `params` are the query parameters in the order they
 * should be sent; the signature covers them sorted by key, with `[]` keys indexed.
 */
export function signedUrl(base: string, path: string, params: [string, string][]): string {
  const sorted = params
    .map((p, i) => [p, i] as const)
    .sort((a, b) => (a[0][0] < b[0][0] ? -1 : a[0][0] > b[0][0] ? 1 : a[1] - b[1]))
    .map(([p]) => p);
  let lastKey = '';
  let index = 0;
  const signed = sorted
    .map(([key, value]) => {
      if (!key.endsWith('[]')) return `${key}=${value}`;
      if (lastKey !== key) index = 0;
      lastKey = key;
      return `${key.replace('[]', `[${index++}]`)}=${value}`;
    })
    .join('&');
  const vrf = sign(`${path.replace(/^\/api/, '')}${signed ? `?${signed}` : ''}`);
  const query = [...sorted, ['vrf', vrf] as [string, string]]
    .map(([k, v]) => `${encodeURIComponent(k).replace(/%5B/g, '[').replace(/%5D/g, ']')}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}${path}?${query}`;
}
