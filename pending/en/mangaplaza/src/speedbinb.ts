// SpeedBinb reader (Kotlin: keiyoushi.lib.speedbinb): content info API, scramble tables and the
// "ptbinb" descramblers (A and F) expressed as tile operations for `transformImage`.
import type { ImageTransform, Page, TileOp } from '@matane/extension-sdk';
import { imageSize } from './image';

const URLSAFE_BASE64_LOOKUP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PTBINBF_REGEX = /^=([0-9]+)-([0-9]+)([-+])([0-9]+)-([-_0-9A-Za-z]+)$/;
const PTBINBA_CHAR_LOOKUP = 'aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ';

const ServerType = { SBC: 0, DIRECT: 1, REST: 2 } as const;
const ViewMode = { COMMERCIAL: 1, NON_MEMBER_TRIAL: 2, MEMBER_TRIAL: 3 } as const;

interface BibContentItem {
  ContentsServer: string;
  ServerType: number;
  ptbl: string;
  ctbl: string;
  p?: string | null;
  ViewMode: number;
  ContentDate?: string | null;
}

interface SbcContent {
  result: number;
  ttx: string;
  ImageClass?: string | null;
}

function queryParam(url: string, name: string): string | undefined {
  const query = url.split('#')[0]!.split('?')[1] ?? '';
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key === name) return decodeURIComponent(value);
  }
  return undefined;
}

/** Sets query parameters (replacing existing ones, keeping the order of the others). */
function withParams(url: string, params: [string, string | undefined | null][]): string {
  const [path = '', query = ''] = url.split('#')[0]!.split('?');
  const pairs = query ? query.split('&') : [];
  for (const [name, value] of params) {
    if (value === undefined || value === null) continue;
    const encoded = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    const at = pairs.findIndex((pair) => decodeURIComponent(pair.split('=')[0] ?? '') === name);
    if (at >= 0) pairs[at] = encoded;
    else pairs.push(encoded);
  }
  return pairs.length ? `${path}?${pairs.join('&')}` : path;
}

/**
 * The REST content server hands out CloudFront signed cookies (scoped to the chapter's folder). Image fetches
 * can't carry per-chapter cookies, so the same values go in the url as a CloudFront signed url.
 */
function signedParams(setCookie: string): [string, string][] {
  const values: Record<string, string> = {};
  for (const [, name, value] of setCookie.matchAll(/CloudFront-(Policy|Signature|Key-Pair-Id|Expires)=([^;,\s]+)/g))
    values[name!] = value!;
  const names = values.Policy ? ['Policy', 'Signature', 'Key-Pair-Id'] : ['Expires', 'Signature', 'Key-Pair-Id'];
  return names.flatMap((name): [string, string][] => (values[name] ? [[name, values[name]]] : []));
}

function joinPath(base: string, ...segments: string[]): string {
  return `${base.replace(/\/+$/, '')}/${segments.map((s) => s.replace(/^\/+/, '')).join('/')}`;
}

function copyKeyParameters(url: string, from: string): string {
  const params: [string, string | undefined][] = [];
  for (let i = 0; i <= 9; i++) params.push([`u${i}`, queryParam(from, `u${i}`)]);
  return withParams(url, params);
}

function decodeScrambleTable(cid: string, sharedKey: string, table: string): string {
  let e = 0;
  [...`${cid}:${sharedKey}`].forEach((c, i) => {
    e = (e + (c.charCodeAt(0) << (i % 16))) | 0;
  });
  e &= 0x7fffffff;
  if (e === 0) e = 0x12345678;
  let out = '';
  for (const c of table) {
    e = (e >>> 1) ^ (1210056708 & -(e & 1));
    out += String.fromCharCode(((c.charCodeAt(0) - 32 + (e % 94)) % 94) + 32);
  }
  return out;
}

/** The reader picks the key at random; it only has to be well formed, so a seeded one keeps requests replayable. */
function generateSharedKey(cid: string): string {
  const repeated = cid.repeat(Math.floor((cid.length + 15) / cid.length));
  const head = repeated.slice(0, 16);
  const tail = repeated.slice(-16);
  let seed = 0;
  for (const c of cid) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) | 0;
  let s = 0;
  let h = 0;
  let u = 0;
  let out = '';
  for (let i = 0; i < 16; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    const c = URLSAFE_BASE64_LOOKUP[((seed >>> 16) & 0x7fff) % 64]!;
    s ^= c.charCodeAt(0);
    h ^= head.charCodeAt(i);
    u ^= tail.charCodeAt(i);
    out += c + URLSAFE_BASE64_LOOKUP[(s + h + u) & 63]!;
  }
  return out;
}

function determineKeyPair(src: string, ptbl: string[], ctbl: string[]): [string, string] {
  const sums = [0, 0];
  [...src.slice(src.lastIndexOf('/') + 1)].forEach((c, i) => {
    sums[i % 2]! += c.charCodeAt(0);
  });
  return [ptbl[sums[0]! % 8]!, ctbl[sums[1]! % 8]!];
}

function buildImageUrl(
  base: string,
  contentInfoUrl: string,
  src: string,
  item: BibContentItem,
  isSingleQuality: boolean,
  highQualityMode: boolean,
): string {
  if (item.ServerType === ServerType.DIRECT) {
    const filename = isSingleQuality ? 'M.jpg' : highQualityMode ? 'M_H.jpg' : 'M_L.jpg';
    return withParams(joinPath(base, src, filename), [['dmytime', item.ContentDate]]);
  }
  if (item.ServerType === ServerType.REST) {
    let url = joinPath(base, 'img', src);
    if (!isSingleQuality && !highQualityMode) url = withParams(url, [['q', '1']]);
    return copyKeyParameters(withParams(url, [['dmytime', item.ContentDate]]), contentInfoUrl);
  }
  if (item.ServerType === ServerType.SBC) {
    let url = withParams(base, [
      ['src', src],
      ['p', item.p],
    ]);
    if (!isSingleQuality) {
      const trial = item.ViewMode === ViewMode.NON_MEMBER_TRIAL || item.ViewMode === ViewMode.MEMBER_TRIAL;
      url = withParams(url, [['q', highQualityMode && !trial ? '0' : '1']]);
    }
    url = withParams(url, [
      ['vm', String(item.ViewMode)],
      ['dmytime', item.ContentDate],
    ]);
    return copyKeyParameters(url, contentInfoUrl);
  }
  throw new Error(`Unsupported ServerType value ${item.ServerType}`);
}

function sbcUrlOf(item: BibContentItem, contentInfoUrl: string, cid: string): string {
  const server = item.ContentsServer;
  if (item.ServerType === ServerType.DIRECT) return joinPath(server, 'content.js');
  if (item.ServerType === ServerType.REST) return joinPath(server, 'content');
  if (item.ServerType === ServerType.SBC) {
    const url = withParams(joinPath(server, 'sbcGetCntnt.php'), [
      ['cid', cid],
      ['p', item.p],
      ['q', '1'],
      ['vm', String(item.ViewMode)],
      ['dmytime', item.ContentDate ?? '1'],
    ]);
    return copyKeyParameters(url, contentInfoUrl);
  }
  throw new Error(`Unsupported ServerType value ${item.ServerType}`);
}

/**
 * Pages of SpeedBinb content straight from its `bibGetCntntInfo` API; each image url carries the
 * descrambling key pair in its fragment (`#ptbinb,<s>,<u>`). Empty when the reader refuses the content.
 */
export async function fetchPages(
  contentInfoUrl: string,
  cid: string,
  headers: Record<string, string>,
  highQualityMode = true,
): Promise<Page[]> {
  const sharedKey = generateSharedKey(cid);
  const url = withParams(contentInfoUrl, [
    ['cid', cid],
    ['k', sharedKey],
    ['dmytime', '1'],
  ]);
  const infoResponse = await http.get(url, { headers });
  const info = JSON.parse(infoResponse.body) as { result: number; items: unknown[] };
  if (info.result !== 1) return [];
  const auth = signedParams(infoResponse.headers['set-cookie'] ?? '');

  const item = info.items[0] as BibContentItem;
  const ctbl = JSON.parse(decodeScrambleTable(cid, sharedKey, item.ctbl)) as string[];
  const ptbl = JSON.parse(decodeScrambleTable(cid, sharedKey, item.ptbl)) as string[];
  const sbcUrl = sbcUrlOf(item, contentInfoUrl, cid);
  const sbcBody = (await http.get(withParams(sbcUrl, auth), { headers })).body;
  const sbc = JSON.parse(
    item.ServerType === ServerType.DIRECT
      ? sbcBody.slice(sbcBody.indexOf('DataGet_Content(') + 'DataGet_Content('.length, sbcBody.lastIndexOf(')'))
      : sbcBody,
  ) as SbcContent;
  if (sbc.result !== 1) throw new Error('Failed to fetch content');

  const isSingleQuality = sbc.ImageClass === 'singlequality';
  const pageBase =
    item.ServerType === ServerType.SBC ? sbcUrl.replace('/sbcGetCntnt.php', '/sbcGetImg.php') : item.ContentsServer;
  // The ttx never closes its tags: only the first <t-case> is parsed.
  const firstCase = (sbc.ttx.split('<t-case')[1] ?? '').split('>').slice(1).join('>').split('</t-case>')[0]!;
  return html
    .load(firstCase)
    .select('t-img')
    .map((img, index) => {
      const src = img.attr('src') ?? '';
      const [s, u] = determineKeyPair(src, ptbl, ctbl);
      const imageUrl = withParams(
        buildImageUrl(pageBase, contentInfoUrl, src, item, isSingleQuality, highQualityMode),
        auth,
      );
      return { index, imageUrl: `${imageUrl}#ptbinb,${s},${u}` };
    });
}

// ---- descramblers -----------------------------------------------------------------------------

interface Descrambled {
  width: number;
  height: number;
  ops: TileOp[];
}

const op = (sx: number, sy: number, w: number, h: number, dx: number, dy: number): TileOp => ({ sx, sy, w, h, dx, dy });

/** PtBinbDescramblerF: `=<w>-<h>(-|+)<padding>-<tables>` key pair. */
function descrambleF(s: string, u: string, width: number, height: number): Descrambled | undefined {
  const src = PTBINBF_REGEX.exec(s);
  const dst = PTBINBF_REGEX.exec(u);
  if (!src || !dst || dst[1] !== src[1] || dst[2] !== src[2] || dst[4] !== src[4] || dst[3] !== '+' || src[3] !== '-')
    return undefined;
  const widthPieces = Number(dst[1]);
  const heightPieces = Number(dst[2]);
  const padding = Number(dst[4]);
  if (widthPieces < 8 || heightPieces < 8 || widthPieces * heightPieces < 64) return undefined;
  const total = widthPieces * heightPieces;
  if (dst[5]!.length !== widthPieces + heightPieces + total || src[5]!.length !== dst[5]!.length) return undefined;

  const decode = (key: string) => {
    const at = (i: number) => URLSAFE_BASE64_LOOKUP.indexOf(key[i]!);
    return {
      wPos: Array.from({ length: widthPieces }, (_, i) => at(i)),
      hPos: Array.from({ length: heightPieces }, (_, i) => at(widthPieces + i)),
      pieces: Array.from({ length: total }, (_, i) => at(widthPieces + heightPieces + i)),
    };
  };
  const srcTnp = decode(src[5]!);
  const dstTnp = decode(dst[5]!);
  const pieceDest = Array.from({ length: total }, (_, i) => dstTnp.pieces[srcTnp.pieces[i]!]!);

  const extraW = 2 * widthPieces * padding;
  const extraH = 2 * heightPieces * padding;
  const canDescramble =
    width >= 64 + extraW && height >= 64 + extraH && width * height >= (320 + extraW) * (320 + extraH);
  if (!canDescramble) return undefined;

  const canvasWidth = width - extraW;
  const canvasHeight = height - extraH;
  const pieceWidth = Math.floor((canvasWidth + widthPieces - 1) / widthPieces);
  const remainderWidth = canvasWidth - (widthPieces - 1) * pieceWidth;
  const pieceHeight = Math.floor((canvasHeight + heightPieces - 1) / heightPieces);
  const remainderHeight = canvasHeight - (heightPieces - 1) * pieceHeight;

  const ops: TileOp[] = [];
  for (let o = 0; o < total; o++) {
    const hPos = o % widthPieces;
    const wPos = Math.floor(o / widthPieces);
    const hDstPos = pieceDest[o]! % widthPieces;
    const wDstPos = Math.floor(pieceDest[o]! / widthPieces);
    ops.push(
      op(
        padding + hPos * (pieceWidth + 2 * padding) + (srcTnp.wPos[wPos]! < hPos ? remainderWidth - pieceWidth : 0),
        padding + wPos * (pieceHeight + 2 * padding) + (srcTnp.hPos[hPos]! < wPos ? remainderHeight - pieceHeight : 0),
        srcTnp.wPos[wPos] === hPos ? remainderWidth : pieceWidth,
        srcTnp.hPos[hPos] === wPos ? remainderHeight : pieceHeight,
        hDstPos * pieceWidth + (dstTnp.wPos[wDstPos]! < hDstPos ? remainderWidth - pieceWidth : 0),
        wDstPos * pieceHeight + (dstTnp.hPos[hDstPos]! < wDstPos ? remainderHeight - pieceHeight : 0),
      ),
    );
  }
  return { width: canvasWidth, height: canvasHeight, ops };
}

interface Piece {
  x: number;
  y: number;
  w: number;
  h: number;
}

function calculatePieces(key: string): { ndx: number; ndy: number; pieces: Piece[] } | undefined {
  const parts = key.split('-');
  if (parts.length !== 3) return undefined;
  const ndx = Number.parseInt(parts[0]!, 10);
  const ndy = Number.parseInt(parts[1]!, 10);
  const e = parts[2]!;
  if (ndx * ndy * 2 !== e.length) return undefined;
  const a = (ndx - 1) * (ndy - 1) - 1;
  const f = ndx - 1 + a;
  const c = ndy - 1 + f;
  const l = 1 + c;
  let w = 0;
  let h = 0;
  const pieces: Piece[] = [];
  for (let d = 0; d < ndx * ndy; d++) {
    const x = PTBINBA_CHAR_LOOKUP.indexOf(e[2 * d]!);
    const y = PTBINBA_CHAR_LOOKUP.indexOf(e[2 * d + 1]!);
    if (d <= a) [w, h] = [2, 2];
    else if (d <= f) [w, h] = [2, 1];
    else if (d <= c) [w, h] = [1, 2];
    else if (d <= l) [w, h] = [1, 1];
    pieces.push({ x, y, w, h });
  }
  return { ndx, ndy, pieces };
}

/** PtBinbDescramblerA: `<ndx>-<ndy>-<table>` key pair (digits first). */
function descrambleA(s: string, u: string, width: number, height: number): Descrambled | undefined {
  const srcPieces = calculatePieces(u);
  const dstPieces = calculatePieces(s);
  if (!srcPieces || !dstPieces || srcPieces.ndx !== dstPieces.ndx || srcPieces.ndy !== dstPieces.ndy) return undefined;
  if (!(width >= 64 && height >= 64 && width * height >= 102400)) return undefined;

  const n = width - (width % 8);
  const pieceWidth = Math.floor((n - 1) / 7) - (Math.floor((n - 1) / 7) % 8);
  const e = n - 7 * pieceWidth;
  const m = height - (height % 8);
  const pieceHeight = Math.floor((m - 1) / 7) - (Math.floor((m - 1) / 7) % 8);
  const v0 = m - 7 * pieceHeight;

  const ops = srcPieces.pieces.map((src, i) => {
    const dst = dstPieces.pieces[i]!;
    return op(
      Math.floor(src.x / 2) * pieceWidth + (src.x % 2) * e,
      Math.floor(src.y / 2) * pieceHeight + (src.y % 2) * v0,
      Math.floor(src.w / 2) * pieceWidth + (src.w % 2) * e,
      Math.floor(src.h / 2) * pieceHeight + (src.h % 2) * v0,
      Math.floor(dst.x / 2) * pieceWidth + (dst.x % 2) * e,
      Math.floor(dst.y / 2) * pieceHeight + (dst.y % 2) * v0,
    );
  });
  const l = pieceWidth * (srcPieces.ndx - 1) + e;
  const v = pieceHeight * (srcPieces.ndy - 1) + v0;
  if (l < width) ops.push(op(l, 0, width - l, v, l, 0));
  if (v < height) ops.push(op(0, v, width, height - v, 0, v));
  return { width, height, ops };
}

/** `transformImage` for pages made by `fetchPages`. */
export function descramblePage(page: Page, bytes: Uint8Array): ImageTransform {
  const fragment = (page.imageUrl ?? '').split('#')[1] ?? '';
  if (!fragment.startsWith('ptbinb,')) return {};
  const [s = '', u = ''] = fragment.slice('ptbinb,'.length).split(/,(.*)/s);
  if (!s && !u) return {};
  const size = imageSize(bytes);
  if (!size) return {};
  const [width, height] = size;
  let result: Descrambled | undefined;
  if (s[0] === '=' && u[0] === '=') result = descrambleF(s, u, width, height);
  else if (/^\d/.test(s) && /^\d/.test(u)) result = descrambleA(s, u, width, height);
  else throw new Error(`Cannot select descrambler for key pair s=${s}, u=${u}`);
  return result ? { tiles: result } : {};
}
