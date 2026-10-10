// Minimal protobuf wire-format reader (enough for the MANGA Plus / Manga Million responses).

export type Field = number | Uint8Array;
export type Message = Map<number, Field[]>;

/** Parses a message into its fields (repeated fields keep their order). Varints are plain numbers. */
export function decode(bytes: Uint8Array): Message {
  const message: Message = new Map();
  let pos = 0;
  const varint = (): number => {
    let result = 0;
    let scale = 1;
    for (;;) {
      if (pos >= bytes.length) throw new Error('Truncated protobuf');
      const byte = bytes[pos++]!;
      result += (byte & 0x7f) * scale;
      scale *= 128;
      if ((byte & 0x80) === 0) return result;
    }
  };
  while (pos < bytes.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const type = tag % 8;
    let value: Field;
    if (type === 0) value = varint();
    else if (type === 2) {
      const length = varint();
      value = bytes.subarray(pos, pos + length);
      pos += length;
    } else if (type === 1) {
      value = bytes.subarray(pos, pos + 8);
      pos += 8;
    } else if (type === 5) {
      value = bytes.subarray(pos, pos + 4);
      pos += 4;
    } else throw new Error(`Unsupported protobuf wire type ${type}`);
    const list = message.get(field);
    if (list) list.push(value);
    else message.set(field, [value]);
  }
  return message;
}

export const text = (bytes: Uint8Array): string => utf8.decode(Array.from(bytes));

export function str(message: Message | undefined, field: number): string | undefined {
  const value = message?.get(field)?.[0];
  return value instanceof Uint8Array ? text(value) : undefined;
}

export function int(message: Message | undefined, field: number): number | undefined {
  const value = message?.get(field)?.[0];
  return typeof value === 'number' ? value : undefined;
}

export function msg(message: Message | undefined, field: number): Message | undefined {
  const value = message?.get(field)?.[0];
  return value instanceof Uint8Array ? decode(value) : undefined;
}

export function msgs(message: Message | undefined, field: number): Message[] {
  return (message?.get(field) ?? []).flatMap((value) => (value instanceof Uint8Array ? [decode(value)] : []));
}

export const strs = (message: Message | undefined, field: number): string[] =>
  (message?.get(field) ?? []).flatMap((value) => (value instanceof Uint8Array ? [text(value)] : []));
