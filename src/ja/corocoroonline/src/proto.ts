// Minimal protobuf wire-format reader: field number → list of values (varint numbers or byte arrays).
export type Fields = Map<number, (number | Uint8Array)[]>;

export function readProto(bytes: Uint8Array): Fields {
  const out: Fields = new Map();
  let pos = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[pos++];
      if (b === undefined) throw new Error('Truncated protobuf');
      result += (b & 0x7f) * Math.pow(2, shift);
      if (!(b & 0x80)) return result;
      shift += 7;
    }
  };
  while (pos < bytes.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    let value: number | Uint8Array;
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const len = varint();
      value = bytes.subarray(pos, pos + len);
      if (value.length !== len) throw new Error('Truncated protobuf');
      pos += len;
    } else if (wire === 1) {
      value = bytes.subarray(pos, pos + 8);
      pos += 8;
    } else if (wire === 5) {
      value = bytes.subarray(pos, pos + 4);
      pos += 4;
    } else throw new Error(`Unsupported wire type ${wire}`);
    const list = out.get(field);
    if (list) list.push(value);
    else out.set(field, [value]);
  }
  return out;
}

export const messages = (f: Fields, n: number): Fields[] =>
  (f.get(n) ?? []).filter((v): v is Uint8Array => typeof v !== 'number').map(readProto);
export const message = (f: Fields, n: number): Fields | undefined => messages(f, n)[0];
export const text = (f: Fields, n: number): string | undefined => {
  const v = f.get(n)?.[0];
  return v === undefined || typeof v === 'number' ? undefined : utf8.decode(Array.from(v));
};
export const int = (f: Fields, n: number): number | undefined => {
  const v = f.get(n)?.[0];
  return typeof v === 'number' ? v : undefined;
};
