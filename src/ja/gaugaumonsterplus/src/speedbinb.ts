// Port of keiyoushi's SpeedBinb library (BinB reader): page list + tile descrambling via transformImage.
// Pages carry their key pair in the url fragment (`#ptbinb,<s>,<u>`) or their tile list (`#ptimg=<coords>`).
import type { HtmlElement, ImageTransform, Page, TileOp } from '@matane/extension-sdk';

const URLSAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PTBINBF_REGEX = /^=([0-9]+)-([0-9]+)([-+])([0-9]+)-([-_0-9A-Za-z]+)$/;
const PTBINBA_LOOKUP = 'aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ';

const ServerType = { SBC: 0, DIRECT: 1, REST: 2 } as const;
const ViewMode = { COMMERCIAL: 1, NON_MEMBER_TRIAL: 2, MEMBER_TRIAL: 3 } as const;

// ---- helpers (no URL class in the sandbox) -------------------------------------------------------

function queryParam(url: string, name: string): string | undefined {
  const q = url.split('#')[0]!.split('?')[1];
  if (!q) return undefined;
  for (const part of q.split('&')) {
    const [k, v] = part.split('=');
    if (k === name) return decodeURIComponent((v ?? '').replace(/\+/g, ' '));
  }
  return undefined;
}

function setParams(url: string, params: Record<string, string | undefined>): string {
  const [base, query = ''] = url.split('#')[0]!.split('?') as [string, string?];
  const kept = query
    .split('&')
    .filter((p) => p && !(p.split('=')[0]! in params));
  for (const [k, v] of Object.entries(params)) if (v !== undefined) kept.push(`${k}=${encodeURIComponent(v)}`);
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

function keyParams(from: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i <= 9; i++) out[`u${i}`] = queryParam(from, `u${i}`);
  return out;
}

function absolute(base: string, ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  const origin = /^(https?:\/\/[^/]+)/i.exec(base)?.[1] ?? '';
  if (ref.startsWith('//')) return `${origin.split(':')[0]}:${ref}`;
  if (ref.startsWith('/')) return origin + ref;
  return base.split('?')[0]!.replace(/[^/]*$/, '') + ref;
}

// ---- crypto --------------------------------------------------------------------------------------

function determineKeyPair(src: string, ptbl: string[], ctbl: string[]): [string, string] {
  const sums = [0, 0];
  const name = src.slice(src.lastIndexOf('/') + 1);
  for (let i = 0; i < name.length; i++) sums[i % 2]! += name.charCodeAt(i);
  return [ptbl[sums[0]! % 8]!, ctbl[sums[1]! % 8]!];
}

function decodeScrambleTable(cid: string, sharedKey: string, table: string): string {
  const seed = `${cid}:${sharedKey}`;
  let e = 0;
  for (let i = 0; i < seed.length; i++) e = (e + (seed.charCodeAt(i) << i % 16)) | 0;
  e &= 0x7fffffff;
  if (e === 0) e = 0x12345678;
  let out = '';
  for (const c of table) {
    e = ((e >>> 1) ^ (1210056708 & -(e & 1))) | 0;
    out += String.fromCharCode((((c.charCodeAt(0) - 32 + (e >>> 0) % 94) % 94) + 32));
  }
  return out;
}

function generateSharedKey(cid: string): string {
  const repeated = cid.repeat(Math.floor((cid.length + 15) / cid.length));
  const head = repeated.slice(0, 16);
  const tail = repeated.slice(-16);
  let s = 0;
  let h = 0;
  let u = 0;
  let out = '';
  for (let i = 0; i < 16; i++) {
    const c = URLSAFE[Math.floor(Math.random() * URLSAFE.length)]!;
    s ^= c.charCodeAt(0);
    h ^= head.charCodeAt(i);
    u ^= tail.charCodeAt(i);
    out += c + URLSAFE[(s + h + u) & 63];
  }
  return out;
}

// ---- page list -----------------------------------------------------------------------------------

interface BibItem {
  ContentsServer: string;
  ServerType: number;
  ptbl: string;
  ctbl: string;
  p?: string | null;
  ViewMode: number;
  ContentDate?: string | null;
  ShopURL?: string | null;
}

export interface SpeedBinbOptions {
  headers: Record<string, string>;
  /** Request the high quality images when the reader offers both. */
  highQuality?: boolean;
}

/** Pages of a loaded reader document (`#content[data-ptbinb]`, or `data-ptimg` elements). */
export async function speedBinbPagesFromDocument(
  doc: HtmlElement,
  readerUrl: string,
  options: SpeedBinbOptions,
): Promise<Page[]> {
  const content = doc.selectFirst('#content');
  if (!content) throw new Error('Reader not found');
  if (content.attr('data-ptbinb') === undefined) {
    const pages: Page[] = [];
    let index = 0;
    for (const el of content.select('[data-ptimg]')) {
      pages.push(await ptimgPage(index++, absolute(readerUrl, el.attr('data-ptimg')!), options.headers));
    }
    return pages;
  }
  const cid = content.attr('data-ptbinb-cid') || queryParam(readerUrl, 'cid');
  if (!cid) throw new Error('Could not find chapter ID');
  const infoUrl = setParams(absolute(readerUrl, content.attr('data-ptbinb')!), keyParams(readerUrl));
  return speedBinbPages(infoUrl, cid, options);
}

/** Pages of a reader from its `bibGetCntntInfo` API url (including the `u0`-`u9` parameters). */
export async function speedBinbPages(infoUrl: string, cid: string, options: SpeedBinbOptions): Promise<Page[]> {
  const { headers, highQuality = true } = options;
  const sharedKey = generateSharedKey(cid);
  const url = setParams(infoUrl, { cid, k: sharedKey, dmytime: String(Date.now()) });
  const info = (await http.get<{ result: number; items: BibItem[] }>(url, { headers, responseType: 'json' })).body;
  if (info.result !== 1) return [];
  const item = info.items[0]!;
  const ctbl = JSON.parse(decodeScrambleTable(cid, sharedKey, item.ctbl)) as string[];
  const ptbl = JSON.parse(decodeScrambleTable(cid, sharedKey, item.ptbl)) as string[];
  const server = item.ContentsServer.replace(/\/+$/, '');

  let sbcUrl: string;
  if (item.ServerType === ServerType.DIRECT) sbcUrl = `${server}/content.js`;
  else if (item.ServerType === ServerType.REST) sbcUrl = `${server}/content`;
  else if (item.ServerType === ServerType.SBC)
    sbcUrl = setParams(`${server}/sbcGetCntnt.php`, {
      cid,
      p: item.p ?? undefined,
      q: '1',
      vm: String(item.ViewMode),
      dmytime: item.ContentDate ?? String(Date.now()),
      ...keyParams(infoUrl),
    });
  else throw new Error(`Unsupported ServerType value ${item.ServerType}`);

  const sbcRes = await http.get(sbcUrl, { headers });
  let text = sbcRes.body;
  if (item.ServerType === ServerType.DIRECT) {
    text = text.slice(text.indexOf('DataGet_Content(') + 'DataGet_Content('.length, text.lastIndexOf(')'));
  }
  const sbc = JSON.parse(text) as { result: number; ttx: string; ImageClass?: string | null };
  if (sbc.result !== 1) throw new Error('Failed to fetch content');

  const single = sbc.ImageClass === 'singlequality';
  const pageBase =
    item.ServerType === ServerType.SBC ? sbcUrl.split('?')[0]!.replace('/sbcGetCntnt.php', '/sbcGetImg.php') : server;

  const caseStart = sbc.ttx.indexOf('<t-case');
  const afterCase = caseStart >= 0 ? sbc.ttx.slice(sbc.ttx.indexOf('>', caseStart) + 1) : '';
  const firstCase = afterCase.split('</t-case>')[0]!;
  const pages: Page[] = [];
  const re = /<t-img\b[^>]*?\bsrc="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(firstCase))) {
    const src = m[1]!;
    const [s, u] = determineKeyPair(src, ptbl, ctbl);
    let imageUrl: string;
    if (item.ServerType === ServerType.DIRECT) {
      const file = single ? 'M.jpg' : highQuality ? 'M_H.jpg' : 'M_L.jpg';
      imageUrl = setParams(`${server}/${src}/${file}`, { dmytime: item.ContentDate ?? undefined });
    } else if (item.ServerType === ServerType.REST) {
      imageUrl = setParams(`${server}/img/${src}`, {
        q: !single && !highQuality ? '1' : undefined,
        dmytime: item.ContentDate ?? undefined,
        ...keyParams(infoUrl),
      });
    } else {
      const trial = item.ViewMode === ViewMode.NON_MEMBER_TRIAL || item.ViewMode === ViewMode.MEMBER_TRIAL;
      imageUrl = setParams(pageBase, {
        src,
        p: item.p ?? undefined,
        q: single ? undefined : highQuality && !trial ? '0' : '1',
        vm: String(item.ViewMode),
        dmytime: item.ContentDate ?? undefined,
        ...keyParams(infoUrl),
      });
    }
    pages.push({ index: pages.length, imageUrl: `${imageUrl}#ptbinb,${s},${u}` });
  }
  return pages;
}

async function ptimgPage(index: number, jsonUrl: string, headers: Record<string, string>): Promise<Page> {
  const meta = (
    await http.get<{
      resources: { i: { src: string } };
      views: { width: number; height: number; coords: string[] }[];
    }>(jsonUrl, { headers, responseType: 'json' })
  ).body;
  const base = jsonUrl.split('?')[0]!;
  const imageUrl = base.slice(0, base.lastIndexOf('/') + 1) + meta.resources.i.src;
  const v = meta.views[0]!;
  return { index, imageUrl: `${imageUrl}#ptimg=${v.width}x${v.height};${v.coords.join(';')}` };
}

// ---- descrambling --------------------------------------------------------------------------------

interface Tx {
  xsrc: number;
  ysrc: number;
  width: number;
  height: number;
  xdest: number;
  ydest: number;
}
interface Plan {
  canvas: [number, number];
  coords: Tx[];
}

function planF(s: string, u: string, w: number, h: number): Plan | undefined {
  const src = PTBINBF_REGEX.exec(s);
  const dst = PTBINBF_REGEX.exec(u);
  if (!src || !dst || dst[1] !== src[1] || dst[2] !== src[2] || dst[4] !== src[4] || dst[3] !== '+' || src[3] !== '-')
    return undefined;
  const wp = Number(dst[1]);
  const hp = Number(dst[2]);
  const pad = Number(dst[4]);
  if (wp < 8 || hp < 8 || wp * hp < 64) return undefined;
  const e = wp + hp + wp * hp;
  if (dst[5]!.length !== e || src[5]!.length !== e) return undefined;
  const decode = (key: string) => {
    const idx = (i: number) => URLSAFE.indexOf(key[i]!);
    return {
      wPos: Array.from({ length: wp }, (_, i) => idx(i)),
      hPos: Array.from({ length: hp }, (_, i) => idx(wp + i)),
      pieces: Array.from({ length: wp * hp }, (_, i) => idx(wp + hp + i)),
    };
  };
  const st = decode(src[5]!);
  const dt = decode(dst[5]!);
  const pieceDest = Array.from({ length: wp * hp }, (_, i) => dt.pieces[st.pieces[i]!]!);
  const i2 = 2 * wp * pad;
  const n2 = 2 * hp * pad;
  const can = w >= 64 + i2 && h >= 64 + n2 && w * h >= (320 + i2) * (320 + n2);
  if (!can) return { canvas: [w, h], coords: [{ xsrc: 0, ysrc: 0, width: w, height: h, xdest: 0, ydest: 0 }] };
  const cw = w - i2;
  const ch = h - n2;
  const pw = Math.floor((cw + wp - 1) / wp);
  const rw = cw - (wp - 1) * pw;
  const ph = Math.floor((ch + hp - 1) / hp);
  const rh = ch - (hp - 1) * ph;
  const coords: Tx[] = [];
  for (let o = 0; o < wp * hp; o++) {
    const hPos = o % wp;
    const wPos = Math.floor(o / wp);
    const hDst = pieceDest[o]! % wp;
    const wDst = Math.floor(pieceDest[o]! / wp);
    coords.push({
      xsrc: pad + hPos * (pw + 2 * pad) + (st.hPos[wPos]! < hPos ? rw - pw : 0),
      ysrc: pad + wPos * (ph + 2 * pad) + (st.wPos[hPos]! < wPos ? rh - ph : 0),
      width: st.hPos[wPos] === hPos ? rw : pw,
      height: st.wPos[hPos] === wPos ? rh : ph,
      xdest: hDst * pw + (dt.hPos[wDst]! < hDst ? rw - pw : 0),
      ydest: wDst * ph + (dt.wPos[hDst]! < wDst ? rh - ph : 0),
    });
  }
  return { canvas: [cw, ch], coords };
}

function piecesA(key: string) {
  if (!key) return undefined;
  const parts = key.split('-');
  if (parts.length !== 3) return undefined;
  const ndx = parseInt(parts[0]!, 10);
  const ndy = parseInt(parts[1]!, 10);
  const e = parts[2]!;
  if (ndx * ndy * 2 !== e.length) return undefined;
  const a = (ndx - 1) * (ndy - 1) - 1;
  const f = ndx - 1 + a;
  const c = ndy - 1 + f;
  const l = 1 + c;
  let w = 0;
  let h = 0;
  const piece: { x: number; y: number; w: number; h: number }[] = [];
  for (let d = 0; d < ndx * ndy; d++) {
    const x = PTBINBA_LOOKUP.indexOf(e[2 * d]!);
    const y = PTBINBA_LOOKUP.indexOf(e[2 * d + 1]!);
    if (d <= a) {
      h = 2;
      w = 2;
    } else if (d <= f) {
      h = 1;
      w = 2;
    } else if (d <= c) {
      h = 2;
      w = 1;
    } else if (d <= l) {
      h = 1;
      w = 1;
    }
    piece.push({ x, y, w, h });
  }
  return { ndx, ndy, piece };
}

function planA(s: string, u: string, width: number, height: number): Plan | undefined {
  const src = piecesA(u);
  const dst = piecesA(s);
  if (!src || !dst || src.ndx !== dst.ndx || src.ndy !== dst.ndy) return undefined;
  if (!(width >= 64 && height >= 64 && width * height >= 102400))
    return { canvas: [width, height], coords: [{ xsrc: 0, ysrc: 0, width, height, xdest: 0, ydest: 0 }] };
  const coords: Tx[] = [];
  const n = width - (width % 8);
  const pieceW = Math.floor((n - 1) / 7) - (Math.floor((n - 1) / 7) % 8);
  const e = n - 7 * pieceW;
  const s2 = height - (height % 8);
  const pieceH = Math.floor((s2 - 1) / 7) - (Math.floor((s2 - 1) / 7) % 8);
  const u2 = s2 - 7 * pieceH;
  for (let i = 0; i < src.piece.length; i++) {
    const a = src.piece[i]!;
    const b = dst.piece[i]!;
    coords.push({
      xsrc: Math.floor(a.x / 2) * pieceW + (a.x % 2) * e,
      ysrc: Math.floor(a.y / 2) * pieceH + (a.y % 2) * u2,
      width: Math.floor(a.w / 2) * pieceW + (a.w % 2) * e,
      height: Math.floor(a.h / 2) * pieceH + (a.h % 2) * u2,
      xdest: Math.floor(b.x / 2) * pieceW + (b.x % 2) * e,
      ydest: Math.floor(b.y / 2) * pieceH + (b.y % 2) * u2,
    });
  }
  const l = pieceW * (src.ndx - 1) + e;
  const v = pieceH * (src.ndy - 1) + u2;
  if (l < width) coords.push({ xsrc: l, ysrc: 0, width: width - l, height: v, xdest: l, ydest: 0 });
  if (v < height) coords.push({ xsrc: 0, ysrc: v, width, height: height - v, xdest: 0, ydest: v });
  return { canvas: [width, height], coords };
}

/** Width and height of a PNG, JPEG or WebP file. */
export function imageSize(bytes: Uint8Array): [number, number] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [view.getUint32(16), view.getUint32(20)];
  if (bytes[0] === 0x52 && bytes[8] === 0x57) {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8 ') return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    if (chunk === 'VP8X')
      return [
        1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
        1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
      ];
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) return undefined;
      const marker = bytes[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return [view.getUint16(i + 7), view.getUint16(i + 5)];
      i += 2 + view.getUint16(i + 2);
    }
  }
  return undefined;
}

/** `transformImage` for pages made by this module; returns `{}` for pages that are not scrambled. */
export function speedBinbTransform(page: Page, bytes: Uint8Array): ImageTransform {
  const fragment = (page.imageUrl ?? '').split('#')[1] ?? '';
  let plan: Plan | undefined;
  const size = imageSize(bytes);
  if (!size) return {};
  const [w, h] = size;
  if (fragment.startsWith('ptimg=')) {
    const [dims, ...coords] = fragment.slice(6).split(';') as [string, ...string[]];
    const [cw, ch] = dims.split('x').map(Number) as [number, number];
    const txs: Tx[] = [];
    for (const c of coords) {
      const m = /^i:(\d+),(\d+)\+(\d+),(\d+)>(\d+),(\d+)$/.exec(c);
      if (m) txs.push({ xsrc: +m[1]!, ysrc: +m[2]!, width: +m[3]!, height: +m[4]!, xdest: +m[5]!, ydest: +m[6]! });
    }
    if (txs.length) plan = { canvas: [cw, ch], coords: txs };
  } else if (fragment.startsWith('ptbinb,')) {
    const [s = '', u = ''] = fragment.slice(7).split(',');
    if (!s && !u) return {};
    if (s[0] === '=' && u[0] === '=') plan = planF(s, u, w, h);
    else if (/^[0-9]/.test(s) && /^[0-9]/.test(u)) plan = planA(s, u, w, h);
    else throw new Error(`Cannot select descrambler for key pair s=${s}, u=${u}`);
  }
  if (!plan) return {};
  const ops: TileOp[] = plan.coords.map((t) => ({
    sx: t.xsrc,
    sy: t.ysrc,
    w: t.width,
    h: t.height,
    dx: t.xdest,
    dy: t.ydest,
  }));
  return { tiles: { width: plan.canvas[0], height: plan.canvas[1], ops } };
}
