// Port of keiyoushi's Publus library (configuration_pack decoder, keyed image names, tile descrambler).
// Pages carry their parameters as JSON in the url fragment; `publusTransform` rebuilds the picture.
import type { ImageTransform, Page, TileOp } from '@matane/extension-sdk';

// ---------------------------------------------------------------------------------------------------
// Decoder (WASM port)
// ---------------------------------------------------------------------------------------------------

interface State {
  payload: number[];
  length: number;
  key1: number[];
  key2: number[];
  key3: number[];
}

function mod9Base64Decode(data: string): State {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const map: number[] = new Array(256).fill(-1);
  for (let i = 0; i < chars.length; i++) map[chars.charCodeAt(i)] = i;
  const key1 = new Array<number>(32).fill(0);
  const key2 = new Array<number>(32).fill(0);
  const key3 = new Array<number>(32).fill(0);
  let target = key1;
  let d = 0;
  let s = 0;
  while (s < 128) {
    if (s >= data.length) break;
    const c1 = map[data.charCodeAt(s++)]!;
    const c2 = map[data.charCodeAt(s++)]!;
    const c3 = map[data.charCodeAt(s++)]!;
    const c4 = map[data.charCodeAt(s++)]!;
    const b1 = (c1 << 2) | (c2 >> 4);
    const b2 = ((c2 & 15) << 4) | (c3 >> 2);
    const b3 = ((c3 & 3) << 6) | c4;
    target[d++] = b1;
    if (s === 88) {
      target = key3;
      d = 0;
    }
    target[d++] = b2;
    if (s === 44) {
      target = key2;
      d = 0;
    }
    target[d++] = b3;
  }
  const bytes = base64.decodeBytes(data.slice(128));
  const payload = Array.from(bytes);
  return { payload, length: payload.length, key1, key2, key3 };
}

function mod14Mutate(mode: number, state: State): void {
  let lArr: number[];
  let vInt: number;
  let hArr: number[];
  let uArr: number[];
  let pArr: number[] | null;
  switch (mode) {
    case 3:
      lArr = state.key1;
      vInt = 32;
      hArr = state.key2;
      uArr = state.key3;
      pArr = null;
      break;
    case 2:
      lArr = state.key2;
      vInt = 32;
      hArr = state.key1;
      uArr = state.key3;
      pArr = null;
      break;
    case 1:
      lArr = state.key3;
      vInt = 32;
      hArr = state.key1;
      uArr = state.key2;
      pArr = null;
      break;
    default:
      lArr = state.payload;
      vInt = state.length;
      hArr = state.key1;
      uArr = state.key2;
      pArr = state.key3;
  }
  let w = 0;
  let xorSum = 0;
  const nFunc = (arr: number[]) => {
    for (let a = 0; a < 32; a++) {
      w = (w + arr[a]!) & 255;
      xorSum ^= arr[a]!;
    }
  };
  nFunc(hArr);
  nFunc(uArr);
  if (pArr) nFunc(pArr);
  const kFlag = (w & 2) === 0;
  const yFlag = (w & 4) === 0;
  const mFlag = (w & 8) === 0;
  const m = (xorSum >> 5) & 0x7;
  const highShift = 8 - m;
  let g = 0;
  const buffer = new Array<number>(32).fill(0);
  const swap = (arr: number[], i: number, j: number) => {
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  };
  const blockSwap = (start: number, end: number, arr: number[]) => {
    let n = start;
    let t = end;
    while (t > start) {
      swap(arr, n, t);
      t--;
      n--;
    }
  };
  while (g < vInt) {
    let blockEnd = g + 32;
    const isLast = blockEnd > vInt;
    let j: number;
    if (isLast) {
      blockEnd = vInt;
      j = blockEnd - g;
    } else j = 32;
    let runSum = w;
    let runXor = xorSum;
    for (let q = 0; q < j; q++) {
      let x = lArr[g + q]!;
      if (kFlag) x = ((85 & x) << 1) | ((x >> 1) & 85);
      if (yFlag) x = ((51 & x) << 2) | ((x >> 2) & 51);
      if (mFlag) x = ((15 & x) << 4) | ((x >> 4) & 15);
      buffer[q] = x;
      runSum = (runSum + x) & 255;
      runXor ^= x;
    }
    for (let pos = 0; pos < j; pos++) {
      for (let r = 1; r <= 6; r++) {
        const bit = 1 << r;
        if ((pos & (bit - 1)) !== bit - 1) break;
        if ((runSum & bit) !== bit) blockSwap(pos - (1 << (r - 1)), pos, buffer);
      }
    }
    let rot = runXor >> 3;
    if (isLast) rot %= j;
    else rot &= 31;
    if (m === 0) {
      let srcIdx = j - rot;
      if (srcIdx === j) srcIdx = 0;
      for (let r = g; r < blockEnd; r++) {
        lArr[r] = buffer[srcIdx]!;
        srcIdx++;
        if (srcIdx === j) srcIdx = 0;
      }
    } else {
      let srcIdx = j - rot - 1;
      for (let r = g; r < blockEnd; r++) {
        let x = (buffer[srcIdx]! << highShift) & 0xff;
        srcIdx++;
        if (srcIdx === j) srcIdx = 0;
        x |= buffer[srcIdx]! >> m;
        lArr[r] = x & 255;
      }
    }
    g = blockEnd;
  }
}

function rc4Ksa(key: number[]): number[] {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + (key[i % key.length]! & 0xff)) % 256;
    const t = s[i]!;
    s[i] = s[j]!;
    s[j] = t;
  }
  return s;
}

const rc4Key = (...arrays: number[][]): number[] => arrays.flatMap((a) => a.map((v) => v & 0xff));

/** RC4 over `data` with the given key; the keystream is applied to every byte. */
function rc4(data: number[], key: number[]): number[] {
  const s = rc4Ksa(key);
  let i = 0;
  let j = 0;
  const out = new Array<number>(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]!) & 255;
    const t = s[i]!;
    s[i] = s[j]!;
    s[j] = t;
    out[k] = (data[k]! & 0xff) ^ s[(s[i]! + s[j]!) & 255]!;
  }
  return out;
}

function mod6XorLoop(fnKey: number[], state: State): void {
  const sBox = rc4Ksa(rc4Key(state.key2, fnKey, state.key3));
  for (let s = 0; s < state.length; s++) state.payload[s] = state.payload[s]! ^ sBox[s % 256]!;
}

function xorKeystreamDown(state: State, start: number, key: number[]): void {
  if (start < 0) return;
  const keystream = rc4(new Array<number>(Math.floor(start / 2) + 1).fill(0), key);
  for (let i = 0; i < keystream.length; i++) {
    const k = start - 2 * i;
    state.payload[k] = state.payload[k]! ^ keystream[i]!;
  }
}

function mod15Mix(state: State): void {
  const limit = Math.min(32, state.length);
  for (let s = 0; s < limit; s++) {
    const c = state.payload[s]! ^ state.key1[s]! ^ state.key2[s]! ^ state.key3[s]!;
    const arrOf = (bits: number): number[] =>
      bits === 0 ? state.key1 : bits === 4 ? state.key2 : bits === 8 ? state.key3 : state.payload;
    const tArr = arrOf(c & 12);
    let tVal = tArr[s]!;
    switch (c & 3) {
      case 0: {
        const tmp = state.key1[s]!;
        state.key1[s] = tVal;
        tVal = tmp;
        break;
      }
      case 1: {
        const tmp = state.key2[s]!;
        state.key2[s] = tVal;
        tVal = tmp;
        break;
      }
      case 2: {
        const tmp = state.key3[s]!;
        state.key3[s] = tVal;
        tVal = tmp;
        break;
      }
      default: {
        const tmp = state.payload[s]!;
        state.payload[s] = tVal;
        tVal = tmp;
      }
    }
    arrOf(c & 12)[s] = tVal;
    const bits2 = c & 192;
    const tArr2 = bits2 === 0 ? state.key1 : bits2 === 64 ? state.key2 : bits2 === 128 ? state.key3 : state.payload;
    let tVal2 = tArr2[s]!;
    switch (c & 48) {
      case 0: {
        const tmp = state.key1[s]!;
        state.key1[s] = tVal2;
        tVal2 = tmp;
        break;
      }
      case 16: {
        const tmp = state.key2[s]!;
        state.key2[s] = tVal2;
        tVal2 = tmp;
        break;
      }
      case 32: {
        const tmp = state.key3[s]!;
        state.key3[s] = tVal2;
        tVal2 = tmp;
        break;
      }
      default: {
        const tmp = state.payload[s]!;
        state.payload[s] = tVal2;
        tVal2 = tmp;
      }
    }
    if (bits2 === 0) state.key1[s] = tVal2;
    else if (bits2 === 64) state.key2[s] = tVal2;
    else if (bits2 === 128) state.key3[s] = tVal2;
    else state.payload[s] = tVal2;
  }
}

function mod7UpdateKeys(fnKey: number[], state: State): void {
  state.key3 = rc4(state.key3, rc4Key(state.key2, state.key1, fnKey));
  state.key2 = rc4(state.key2, rc4Key(state.key1, fnKey, state.key3));
  state.key1 = rc4(state.key1, rc4Key(fnKey, state.key3, state.key2));
}

/** Decodes a `configuration_pack.json` payload; returns the JSON text and the three keys. */
export function decodeConfigurationPack(
  data: string,
  filename = 'configuration_pack.json',
): { json: string; keys: number[][] } {
  const fnKey = Array.from(utf8.encode(filename), (b) => b & 0xff);
  const state = mod9Base64Decode(data);
  mod14Mutate(0, state);
  mod6XorLoop(fnKey, state);
  xorKeystreamDown(state, (state.length | 1) - 2, rc4Key(fnKey, state.key1, state.key2));
  xorKeystreamDown(state, (state.length - 1) & -2, rc4Key(state.key3, fnKey, state.key1));
  mod15Mix(state);
  mod7UpdateKeys(fnKey, state);
  mod14Mutate(1, state);
  mod14Mutate(2, state);
  mod14Mutate(3, state);
  const payload = rc4(state.payload.slice(0, state.length), rc4Key(state.key3, state.key2, fnKey));
  return { json: utf8.decode(payload), keys: [state.key1, state.key2, state.key3] };
}

// ---------------------------------------------------------------------------------------------------
// Image names + descrambling
// ---------------------------------------------------------------------------------------------------

class B2y {
  static readonly CGH: number[][] = [
    [1, 3, 10],
    [1, 5, 16],
    [1, 5, 19],
    [1, 9, 29],
    [1, 11, 6],
    [1, 11, 16],
    [1, 19, 3],
    [1, 21, 20],
    [1, 27, 27],
    [2, 5, 15],
    [2, 5, 21],
    [2, 7, 7],
    [2, 7, 9],
    [2, 7, 25],
    [2, 9, 15],
    [2, 15, 17],
    [2, 15, 25],
    [2, 21, 9],
    [3, 1, 14],
    [3, 3, 26],
    [3, 3, 28],
    [3, 3, 29],
    [3, 5, 20],
    [3, 5, 22],
    [3, 5, 25],
    [3, 7, 29],
    [3, 13, 7],
    [3, 23, 25],
    [3, 25, 24],
    [3, 27, 11],
    [4, 3, 17],
    [4, 3, 27],
    [4, 5, 15],
    [5, 3, 21],
    [5, 7, 22],
    [5, 9, 7],
    [5, 9, 28],
    [5, 9, 31],
    [5, 13, 6],
    [5, 15, 17],
    [5, 17, 13],
    [5, 21, 12],
    [5, 27, 8],
    [5, 27, 21],
    [5, 27, 25],
    [5, 27, 28],
    [6, 1, 11],
    [6, 3, 17],
    [6, 17, 9],
    [6, 21, 7],
    [6, 21, 13],
    [7, 1, 9],
    [7, 1, 18],
    [7, 1, 25],
    [7, 13, 25],
    [7, 17, 21],
    [7, 25, 12],
    [7, 25, 20],
    [8, 7, 23],
    [8, 9, 23],
    [9, 5, 14],
    [9, 5, 25],
    [9, 11, 19],
    [9, 21, 16],
    [10, 9, 21],
    [10, 9, 25],
    [11, 7, 12],
    [11, 7, 16],
    [11, 17, 13],
    [11, 21, 13],
    [12, 9, 23],
    [13, 3, 17],
    [13, 3, 27],
    [13, 5, 19],
    [13, 17, 15],
    [14, 1, 15],
    [14, 13, 15],
    [15, 1, 29],
    [17, 15, 20],
    [17, 15, 23],
    [17, 15, 26],
  ];
  static readonly DGH: ((p1: number, p2: number, p3: number, p4: number) => number)[] = [
    (r, p2, p3, p4) => {
      r ^= r << p2;
      r ^= r >>> p3;
      r ^= r << p4;
      return r | 0;
    },
    (r, p2, p3, p4) => {
      r ^= r << p4;
      r ^= r >>> p3;
      r ^= r << p2;
      return r | 0;
    },
    (r, p2, p3, p4) => {
      r ^= r >>> p2;
      r ^= r << p3;
      r ^= r >>> p4;
      return r | 0;
    },
    (r, p2, p3, p4) => {
      r ^= r >>> p4;
      r ^= r << p3;
      r ^= r >>> p2;
      return r | 0;
    },
    (r, p2, p3, p4) => {
      r ^= r << p2;
      r ^= r << p4;
      r ^= r >>> p3;
      return r | 0;
    },
    (r, p2, p3, p4) => {
      r ^= r >>> p2;
      r ^= r >>> p4;
      r ^= r << p3;
      return r | 0;
    },
  ];
  static readonly GGH = 2463534242 | 0;

  private jgh = B2y.GGH;
  private lgh = B2y.CGH[74]![0]!;
  private mgh = B2y.CGH[74]![1]!;
  private ngh = B2y.CGH[74]![2]!;
  private ogh = B2y.DGH[0]!;

  b9es(e: number, l: number): void {
    this.jgh = B2y.GGH;
    const p = B2y.CGH[e]!;
    this.lgh = p[0]!;
    this.mgh = p[1]!;
    this.ngh = p[2]!;
    this.ogh = B2y.DGH[l]!;
  }

  b0o(p1: number): void {
    this.jgh = p1 !== 0 ? p1 | 0 : B2y.GGH;
  }

  b4k(p1: number): number {
    if (p1 <= 1) return 0;
    const vVgh = (-1 - p1) | 0;
    let sgh: number;
    let tgh: number;
    let ugh = this.jgh;
    do {
      ugh = this.ogh(ugh, this.lgh, this.mgh, this.ngh);
      tgh = (ugh - 1) | 0;
      sgh = (tgh >>> 0) % p1;
    } while (vVgh >>> 0 < ((tgh - sgh) | 0) >>> 0);
    this.jgh = ugh;
    return sgh;
  }
}

const KEY_BYTES = (keys: number[][]) => keys.map((k) => k.map((v) => v | 0));

/** Image file name of a page (WASM `generateFilename`). */
export function generateFilename(pageId: string, keys: number[][], no: number): string {
  if (!keys.length || !keys[0]!.length) return `${pageId}/${no}.jpeg`;
  const [k1, k2, k3] = keys as [number[], number[], number[]];
  const fileName = String(no);
  const parentFolder = `${pageId}/`;
  const b9W = k1.map((v, i) => v ^ k2[i]! ^ k3[i]!);
  const jdf = '10';
  const pathStr = parentFolder + fileName;
  const pathLength = pathStr.length;
  const vBef = (1 + pathLength) << 1;
  const vCef = new Array<number>(vBef).fill(0);
  vCef[0] = 0;
  vCef[1] = 59;
  let vPdf = 2;
  for (let o = 0; o < pathLength; o++) {
    const c = pathStr.charCodeAt(o);
    vCef[vPdf++] = c >>> 8;
    vCef[vPdf++] = c & 255;
  }
  let vFef = 3;
  let vEef = (fileName.length << 1) + vBef + vBef;
  while (vEef < 256) {
    vFef++;
    vEef += vBef;
  }
  let vJef = 1670739;
  let vKef = 1282576;
  let vLef = 2237221;
  let i = (1 + parentFolder.length) << 1;
  let j = 0;
  for (let n = 0; n < vFef; n++) {
    while (i < vBef) {
      vLef ^= vCef[i++]! ^ b9W[j++]!;
      const vIef = 435 * vLef;
      const vHef = 435 * vKef + ((vLef & 7) << 18) + Math.floor(vIef / 4194304);
      const vGef = 435 * vJef + ((vKef & 3) << 19) + ((vLef & 4194296) >>> 3) + Math.floor(vHef / 2097152);
      vLef = vIef % 4194304;
      vKef = vHef % 2097152;
      vJef = vGef % 2097152;
      if (j >= b9W.length) j = 0;
    }
    i = 0;
  }
  const hex = (v: number) => (v < 10 ? 48 + v : 87 + v);
  let hash = '';
  const values = [
    (vJef >>> 13) ^ b9W[0]!,
    ((vJef >>> 5) & 255) ^ b9W[1]!,
    (((vJef & 31) << 3) | (vKef >>> 18)) ^ b9W[2]!,
    ((vKef >>> 10) & 255) ^ b9W[3]!,
    ((vKef >>> 2) & 255) ^ b9W[4]!,
    (((vKef & 3) << 6) | (vLef >>> 16)) ^ b9W[5]!,
    ((vLef >>> 8) & 255) ^ b9W[6]!,
    (vLef & 255) ^ b9W[7]!,
  ];
  for (const v of values) hash += String.fromCharCode(hex(v >>> 4)) + String.fromCharCode(hex(v & 15));
  return `${parentFolder}${jdf}${hash}.jpeg`;
}

interface Move {
  srcX: number;
  srcY: number;
  destX: number;
  destY: number;
  width: number;
  height: number;
}

const vMhf = (arr: number[]): number => {
  let n = 0;
  let o = arr.length & -4;
  if (o > 32) o = 32;
  let i = 0;
  while (i < o) {
    n ^= arr[i++]! << 24;
    n ^= arr[i++]! << 16;
    n ^= arr[i++]! << 8;
    n ^= arr[i++]! << 0;
  }
  return n | 0;
};

function vMqg(tog: B2y, total: number): number[] {
  const arr = new Array<number>(total).fill(0);
  for (let i = 0; i < total; i++) {
    const n = tog.b4k(i + 1);
    arr[i] = arr[n]!;
    arr[n] = i;
  }
  return arr;
}
const v6qg = (tog: B2y, v: number) => (v < 4 ? tog.b4k(v + 1) : tog.b4k(v - 1) + 1);
const v7qg = (tog: B2y, ye: number, ee: number) => {
  if (ee <= 0) return 0;
  const v = tog.b4k(ee);
  return v < ye ? v : v + 1;
};

function v9qg(tog: B2y, p2: number[], p3: number[], p4: number, p5: number, p6: number, p7: number): void {
  let dq = p6;
  let eq = p7;
  let fq = p4;
  let gq = p5;
  let hq = 0;
  let iq = 0;
  const jq = -1;
  while (dq + eq > 0) {
    const aq = tog.b4k(dq + eq);
    let bq: number;
    let cq: number;
    if (aq < dq) {
      if (aq < fq) {
        bq = iq;
        while (bq > 0 && hq < p2[bq + jq]!) bq--;
        cq = iq + eq;
        while (cq < p7 && hq < p2[cq]!) cq++;
        p3[hq] = tog.b4k(cq - bq) + bq;
        hq++;
        fq--;
      } else {
        bq = iq;
        while (bq > 0 && hq + dq > p2[bq + jq]!) bq--;
        cq = iq + eq;
        while (cq < p7 && hq + dq > p2[cq]!) cq++;
        p3[hq + dq + jq] = tog.b4k(cq - bq) + bq;
      }
      dq--;
    } else {
      if (aq - dq < gq) {
        bq = hq;
        while (bq > 0 && iq < p3[bq + jq]!) bq--;
        cq = hq + dq;
        while (cq < p6 && iq < p3[cq]!) cq++;
        p2[iq] = tog.b4k(cq - bq) + bq;
        iq++;
        gq--;
      } else {
        bq = hq;
        while (bq > 0 && iq + eq > p3[bq + jq]!) bq--;
        cq = hq + dq;
        while (cq < p6 && iq + eq > p3[cq]!) cq++;
        p2[iq + eq + jq] = tog.b4k(cq - bq) + bq;
      }
      eq--;
    }
  }
}

function vQpg(
  p1: number,
  p2: number,
  p3: number[],
  p4: number[],
  p5: number[],
  p6: number[],
  p7: number[],
  p8: number,
  p9: number,
  p10: number[],
  p11: number[],
  p12: number,
  p13: number,
): number[] {
  const v1 = p1 + 1;
  const v2 = p2 + 1;
  const v3 = v1 << 1;
  const v4 = v2 << 1;
  const result = new Array<number>(v3 * v2).fill(0);
  let o = 0;
  for (let vV = 0; vV < p1; vV++) {
    for (let vW = 0; vW < p2; vW++) {
      const vZ = p3[vV + vW * p1]!;
      const vX = vZ % p1;
      const vY = (vZ - vX) / p1;
      const vR = vV < p11[vW]! ? vV : vV + v1;
      const vS = vW < p10[vV]! ? vW : vW + v2;
      const vT = vX < p7[vY]! ? vX : vX + v1;
      const vU = vY < p6[vX]! ? vY : vY + v2;
      result[o++] = vU * v3 + vR;
      result[o++] = vT * v4 + vS;
    }
  }
  result[o++] = p9 * v3 + p12;
  result[o++] = p8 * v4 + p13;
  for (let vV = 0; vV < p1; vV++) {
    const vX = p4[vV]!;
    const vR = vV < p12 ? vV : vV + v1;
    const vT = vX < p8 ? vX : vX + v1;
    result[o++] = p6[vX]! * v3 + vR;
    result[o++] = vT * v4 + p10[vV]!;
  }
  for (let vW = 0; vW < p2; vW++) {
    const vY = p5[vW]!;
    const vS = vW < p13 ? vW : vW + v2;
    const vU = vY < p9 ? vY : vY + v2;
    result[o++] = vU * v3 + p11[vW]!;
    result[o++] = p7[vY]! * v4 + vS;
  }
  return result;
}

function a3f(p1: number, p2: number, p3: number, p4: number): number[] {
  const tog = new B2y();
  const lo = (x: number) => (x % 4294967296) | 0;
  const vUog = lo(p2) ^ lo(p3) ^ lo(p4);
  const vVog = Math.floor(p1 / 65536) | 0;
  const vWog = Math.floor(p2 / 65536) | 0;
  const vXog = Math.floor(p3 / 65536) | 0;
  const vYog = Math.floor(p4 / 65536) | 0;
  let v1pg = vWog ^ vXog ^ vYog;
  let v2pg = vVog ^ vYog;
  let v3pg = lo(p1) ^ lo(p2);
  let v4pg = lo(p1) ^ lo(p3);
  let v5pg = lo(p1) ^ lo(p4);
  v1pg = v1pg >>> 16;
  const v6pg = v1pg % B2y.DGH.length;
  const v7pg = ((v1pg - v6pg) / B2y.DGH.length) % B2y.CGH.length;
  tog.b9es(v7pg, v6pg);
  tog.b0o(vUog);
  const v9pg = tog.b4k(65536) | (tog.b4k(65536) << 16);
  const vApg = tog.b4k(512);
  const vBpg = vWog >>> 16;
  const vCpg = vXog >>> 16;
  v2pg = (v2pg >>> 16) ^ vApg;
  v3pg ^= v9pg;
  v4pg ^= v9pg;
  v5pg ^= v9pg;
  const vDpg = v2pg % B2y.DGH.length;
  const vEpg = ((v2pg - vDpg) / B2y.DGH.length) % B2y.CGH.length;
  tog.b9es(vEpg, vDpg);
  tog.b0o(v3pg);
  const vFpg = vMqg(tog, vBpg * vCpg);
  tog.b0o(v4pg);
  const vGpg = v6qg(tog, vBpg);
  const vHpg = v6qg(tog, vCpg);
  const vIpg = v7qg(tog, vGpg, vBpg);
  const vJpg = v7qg(tog, vHpg, vCpg);
  tog.b0o(v5pg);
  const maxLen = Math.max(vBpg, vCpg, vBpg * vCpg) * 2 + 500;
  const kArr = new Array<number>(maxLen).fill(0);
  const lArr = new Array<number>(maxLen).fill(0);
  v9qg(tog, kArr, lArr, vGpg, vHpg, vBpg, vCpg);
  const vMpg = vMqg(tog, vBpg);
  const vNpg = vMqg(tog, vCpg);
  const oArr = new Array<number>(maxLen).fill(0);
  const pArr = new Array<number>(maxLen).fill(0);
  v9qg(tog, pArr, oArr, vIpg, vJpg, vBpg, vCpg);
  return vQpg(vBpg, vCpg, vFpg, vMpg, vNpg, oArr, pArr, vIpg, vJpg, lArr, kArr, vGpg, vHpg);
}

interface PageAttributes {
  no: number;
  ns: number;
  ps: number;
  rs: number;
  blockWidth: number;
  blockHeight: number;
  contentWidth: number;
  contentHeight: number;
}

function unscrambleMoves(
  width: number,
  height: number,
  page: PageAttributes,
  keys: number[][],
  pageId: string,
): Move[] {
  const [k1, k2, k3] = keys as [number[], number[], number[]];
  let v0if = 47;
  for (const c of pageId) v0if += c.charCodeAt(0);
  for (const c of String(page.no)) v0if += c.charCodeAt(0);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  v0if += sum(k1) + sum(k2) + sum(k3);
  let v9if = v0if & 255;
  v9if |= v9if << 8;
  v9if |= v9if << 16;
  const b2yLen = B2y.CGH.length * B2y.DGH.length;
  const b0a = v0if % b2yLen;
  const b0j = v9if ^ vMhf(k1) ^ (page.ns | 0);
  const b0k = v9if ^ vMhf(k2) ^ (page.ps | 0);
  const b0n = v9if ^ vMhf(k3) ^ (page.rs | 0);
  const blocksX = Math.floor(width / page.blockWidth);
  const blocksY = Math.floor(height / page.blockHeight);
  const lastW = width % page.blockWidth;
  const lastH = height % page.blockHeight;
  const v14j = (blocksX + 1) << 1;
  const v24j = (blocksY + 1) << 1;
  const b2y = new B2y();
  const v64j = b0a ^ blocksX ^ blocksY;
  const v74j = v64j % B2y.DGH.length;
  const v84j = ((v64j - v74j) / B2y.DGH.length) % B2y.CGH.length;
  b2y.b9es(v84j, v74j);
  b2y.b0o(b0j ^ b0k ^ b0n);
  const v94j = b2y.b4k(65536) + b2y.b4k(65536) * 65536 + b2y.b4k(512) * 4294967296;
  const vD4j = a3f(
    v94j,
    blocksX * 4294967296 + (b0j >>> 0),
    blocksY * 4294967296 + (b0k >>> 0),
    b0a * 4294967296 + (b0n >>> 0),
  );
  const moves: Move[] = [];
  const process = (index: number, total: number, stepW: number, stepH: number) => {
    let idx = index;
    if (stepW !== 0 && stepH !== 0) {
      while (idx < total) {
        const f = vD4j[idx++]!;
        const g = vD4j[idx++]!;
        const h = f % v14j;
        const i = g % v24j;
        const jj = (g - i) / v24j;
        const k = (f - h) / v14j;
        moves.push({
          srcX: h * page.blockWidth - (h > blocksX ? (blocksX + 1) * page.blockWidth - lastW : 0),
          srcY: i * page.blockHeight - (i > blocksY ? (blocksY + 1) * page.blockHeight - lastH : 0),
          destX: jj * page.blockWidth - (jj > blocksX ? (blocksX + 1) * page.blockWidth - lastW : 0),
          destY: k * page.blockHeight - (k > blocksY ? (blocksY + 1) * page.blockHeight - lastH : 0),
          width: stepW,
          height: stepH,
        });
      }
    }
  };
  let vx = 0;
  let vy = blocksX * blocksY * 2;
  process(vx, vy, page.blockWidth, page.blockHeight);
  vx = vy;
  vy += 2;
  process(vx, vy, lastW, lastH);
  vx = vy;
  vy += blocksX * 2;
  process(vx, vy, page.blockWidth, lastH);
  vx = vy;
  vy += blocksY * 2;
  process(vx, vy, lastW, page.blockHeight);
  return moves;
}

function unscrambleNoKeysMoves(width: number, height: number, pattern: number, bw = 64, bh = 64): Move[] {
  const blocksX = Math.floor(width / bw);
  const blocksY = Math.floor(height / bh);
  const restX = width % bw;
  const restY = height % bh;
  let g = 0;
  if (blocksX > 0) {
    g = blocksX - ((43 * pattern) % blocksX);
    if (g % blocksX === 0) g = (blocksX - 4) % blocksX;
    if (g === 0) g = blocksX - 1;
  }
  let l = 0;
  if (blocksY > 0) {
    l = blocksY - ((47 * pattern) % blocksY);
    if (l % blocksY === 0) l = (blocksY - 4) % blocksY;
    if (l === 0) l = blocksY - 1;
  }
  const pos = (a: number, f: number, b: number, e: number) => a * e + (a >= f ? b : 0);
  const xX = (a: number, f: number, b: number) => (f === 0 ? 0 : (a + 61 * b) % f);
  const yX = (a: number, f: number, b: number, e: number, d: number) => {
    const c = d % 2 === 1;
    let ev = e;
    let fv: number;
    if (a < f ? c : !c) {
      ev = b;
      fv = 0;
    } else {
      ev -= b;
      fv = b;
    }
    return ev === 0 ? 0 : ((a + 53 * d + 59 * b) % ev) + fv;
  };
  const xY = (a: number, f: number, b: number, e: number, d: number) => {
    const c = d % 2 === 1;
    let ev = e;
    let bv: number;
    if (a < b ? c : !c) {
      ev -= f;
      bv = f;
    } else {
      ev = f;
      bv = 0;
    }
    return ev === 0 ? 0 : ((a + 67 * d + f + 71) % ev) + bv;
  };
  const yY = (a: number, f: number, b: number) => (f === 0 ? 0 : (a + 73 * b) % f);
  const moves: Move[] = [];
  if (restX > 0 && restY > 0) {
    const sx = g * bw;
    const sy = l * bh;
    moves.push({ srcX: sx, srcY: sy, destX: sx, destY: sy, width: restX, height: restY });
  }
  if (restY > 0) {
    for (let r = 0; r < blocksX; r++) {
      const p = xX(r, blocksX, pattern);
      const k = yX(p, g, l, blocksY, pattern);
      moves.push({
        srcX: pos(r, g, restX, bw),
        srcY: l * bh,
        destX: pos(p, g, restX, bw),
        destY: k * bh,
        width: bw,
        height: restY,
      });
    }
  }
  if (restX > 0) {
    for (let q = 0; q < blocksY; q++) {
      const k = yY(q, blocksY, pattern);
      const p = xY(k, g, l, blocksX, pattern);
      moves.push({
        srcX: g * bw,
        srcY: pos(q, l, restY, bh),
        destX: p * bw,
        destY: pos(k, l, restY, bh),
        width: restX,
        height: bh,
      });
    }
  }
  for (let r = 0; r < blocksX; r++) {
    for (let q = 0; q < blocksY; q++) {
      const p = (r + 29 * pattern + 31 * q) % blocksX;
      const k = (q + 37 * pattern + 41 * p) % blocksY;
      const t = p >= xY(k, g, l, blocksX, pattern) ? restX : 0;
      const n = k >= yX(p, g, l, blocksY, pattern) ? restY : 0;
      moves.push({
        srcX: r * bw + (r >= g ? restX : 0),
        srcY: q * bh + (q >= l ? restY : 0),
        destX: p * bw + t,
        destY: k * bh + n,
        width: bw,
        height: bh,
      });
    }
  }
  return moves;
}

// ---------------------------------------------------------------------------------------------------
// Page list
// ---------------------------------------------------------------------------------------------------

export interface PublusAuth {
  hti?: string | null;
  cfg?: string | null;
  bid?: string | null;
  uuid?: string | null;
  pfCd?: string | null;
  policy?: string | null;
  signature?: string | null;
  keyPairId?: string | null;
}

/** The `auth_info` block of a Publus content API response, as a `PublusAuth`. */
export function toPublusAuth(
  info:
    | {
        hti?: string | null;
        cfg?: number | null;
        uuid?: string | null;
        pfCd?: string | null;
        Policy?: string | null;
        Signature?: string | null;
        'Key-Pair-Id'?: string | null;
      }
    | null
    | undefined,
  bid?: string | null,
  includeBookAuth = true,
): PublusAuth | undefined {
  if (!info) return undefined;
  return {
    hti: includeBookAuth ? info.hti : null,
    cfg: includeBookAuth && info.cfg != null ? String(info.cfg) : null,
    bid: includeBookAuth ? bid : null,
    uuid: includeBookAuth ? info.uuid : null,
    pfCd: info.pfCd,
    policy: info.Policy,
    signature: info.Signature,
    keyPairId: info['Key-Pair-Id'],
  };
}

/** The auth parameters as a query string (`a=b&c=d`), without a leading `?`. */
export function publusAuthQuery(auth: PublusAuth | undefined): string {
  if (!auth) return '';
  const pairs: [string, string | null | undefined][] = [
    ['hti', auth.hti],
    ['cfg', auth.cfg],
    ['BID', auth.bid],
    ['uuid', auth.uuid],
    ['pfCd', auth.pfCd],
    ['Policy', auth.policy],
    ['Signature', auth.signature],
    ['Key-Pair-Id', auth.keyPairId],
  ];
  return pairs
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
}

interface Fragment {
  file: string;
  no: number;
  ns: number;
  ps: number;
  rs: number;
  bw: number;
  bh: number;
  cw: number;
  ch: number;
  k1: number[];
  k2: number[];
  k3: number[];
  extra?: Record<string, string> | null;
  s: boolean;
}

/** Pages of a Publus content (`<contentUrl>/configuration_pack.json` + keyed image names). */
export async function publusPages(
  contentUrl: string,
  headers: Record<string, string>,
  auth?: PublusAuth,
  extra?: Record<string, string>,
  hashFilenames = true,
): Promise<Page[]> {
  const base = contentUrl.replace(/\/+$/, '');
  const query = publusAuthQuery(auth);
  const sep = (u: string) => (query ? `${u}${u.includes('?') ? '&' : '?'}${query}` : u);
  const root = (
    await http.get<Record<string, unknown>>(sep(`${base}/configuration_pack.json`), { headers, responseType: 'json' })
  ).body;
  const decoded = typeof root.data === 'string' ? decodeConfigurationPack(root.data) : undefined;
  const config = (decoded ? JSON.parse(decoded.json) : root) as Record<string, any>;
  const keys = decoded?.keys ?? [];
  const contents = (config.configuration as { contents: { index: number; file: string }[] } | undefined)?.contents;
  if (!contents) throw new Error('Configuration not found in decrypted JSON');
  const filenameKeys = hashFilenames ? keys : [];
  return contents.map((entry, position) => {
    const info = config[entry.file]?.FileLinkInfo?.PageLinkInfoList?.[0]?.Page;
    if (!info) throw new Error(`Page config not found for ${entry.file}`);
    const imageUrl = sep(`${base}/${generateFilename(entry.file, KEY_BYTES(filenameKeys), info.No ?? 0)}`);
    const fragment: Fragment = {
      file: entry.file,
      no: info.No ?? 0,
      ns: info.NS ?? 0,
      ps: info.PS ?? 0,
      rs: info.RS ?? 0,
      bw: info.BlockWidth ?? 0,
      bh: info.BlockHeight ?? 0,
      cw: info.Size?.Width ?? 0,
      ch: info.Size?.Height ?? 0,
      k1: keys[0] ?? [],
      k2: keys[1] ?? [],
      k3: keys[2] ?? [],
      extra: extra ?? null,
      s: info.DummyWidth != null,
    };
    return { index: position, imageUrl: `${imageUrl}#${JSON.stringify(fragment)}` };
  });
}

/** The `extra` map stored in a page's fragment (per-page session data), if any. */
export function publusFragmentExtra(page: Page): Record<string, string> | undefined {
  const raw = (page.imageUrl ?? '').split('#')[1];
  if (!raw) return undefined;
  try {
    return (JSON.parse(raw) as Fragment).extra ?? undefined;
  } catch {
    return undefined;
  }
}

function imageSize(bytes: Uint8Array): [number, number] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [view.getUint32(16), view.getUint32(20)];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) return undefined;
      const marker = bytes[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return [view.getUint16(i + 7), view.getUint16(i + 5)];
      i += 2 + view.getUint16(i + 2);
    }
  }
  return undefined;
}

/** `transformImage` for pages made by `publusPages`. */
export function publusTransform(page: Page, bytes: Uint8Array): ImageTransform {
  const raw = (page.imageUrl ?? '').split('#')[1];
  if (!raw) return {};
  let params: Fragment;
  try {
    params = JSON.parse(raw) as Fragment;
  } catch {
    return {};
  }
  if (!params.s) return {};
  const size = imageSize(bytes);
  if (!size) return {};
  const [width, height] = size;
  let moves: Move[];
  if (!params.k1.length || params.bw === 0) {
    let sum = 0;
    for (const c of `${params.file}/${params.no}`) sum += c.charCodeAt(0);
    moves = unscrambleNoKeysMoves(width, height, (sum % 4) + 1);
  } else {
    moves = unscrambleMoves(
      width,
      height,
      {
        no: params.no,
        ns: params.ns,
        ps: params.ps,
        rs: params.rs,
        blockWidth: params.bw,
        blockHeight: params.bh,
        contentWidth: params.cw,
        contentHeight: params.ch,
      },
      [params.k1, params.k2, params.k3],
      params.file,
    );
  }
  const crop = params.cw > 0 && params.ch > 0;
  // Kotlin copies the rect at (destX, destY) of the scrambled image to (srcX, srcY).
  const canvasW = crop ? params.cw : width;
  const canvasH = crop ? params.ch : height;
  const ops: TileOp[] = [];
  for (const m of moves) {
    // The picture is cropped to the content size afterwards: clip tiles to the canvas.
    const w = Math.min(m.width, canvasW - m.srcX);
    const h = Math.min(m.height, canvasH - m.srcY);
    if (w <= 0 || h <= 0) continue;
    ops.push({ sx: m.destX, sy: m.destY, w, h, dx: m.srcX, dy: m.srcY });
  }
  return { tiles: { width: canvasW, height: canvasH, ops } };
}
