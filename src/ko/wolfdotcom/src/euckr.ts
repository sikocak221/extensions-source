import { EUC_KR_TABLE } from './euckr-table';

const COLUMNS = 0xfe - 0xa1 + 1;
let reverse: Map<string, number> | undefined;

/** Decodes EUC-KR bytes (the site's charset) to a string; unmapped characters become U+FFFD. */
export function decodeEucKr(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const lead = bytes[i]!;
    const trail = bytes[i + 1] ?? 0;
    if (lead < 0x80) chunk.push(String.fromCharCode(lead));
    else if (lead >= 0xa1 && lead <= 0xfe && trail >= 0xa1 && trail <= 0xfe) {
      chunk.push(EUC_KR_TABLE[(lead - 0xa1) * COLUMNS + trail - 0xa1] ?? '�');
      i++;
    } else chunk.push('�');
    if (chunk.length >= 4096) {
      parts.push(chunk.join(''));
      chunk = [];
    }
  }
  parts.push(chunk.join(''));
  return parts.join('');
}

/** Java's URLEncoder.encode(text, "EUC-KR"): the site only understands EUC-KR query values. */
export function encodeEucKr(text: string): string {
  const map = reverse ?? (reverse = new Map());
  if (map.size === 0) {
    for (let i = 0; i < EUC_KR_TABLE.length; i++) {
      const char = EUC_KR_TABLE[i]!;
      if (char !== '�') map.set(char, ((Math.floor(i / COLUMNS) + 0xa1) << 8) | ((i % COLUMNS) + 0xa1));
    }
  }
  const hex = (byte: number) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  let out = '';
  for (const char of text) {
    if (/[A-Za-z0-9.\-*_]/.test(char)) out += char;
    else if (char === ' ') out += '+';
    else {
      const code = map.get(char);
      if (code !== undefined) out += hex(code >> 8) + hex(code & 0xff);
      else if (char.charCodeAt(0) < 0x80) out += hex(char.charCodeAt(0));
      else out += '%3F';
    }
  }
  return out;
}
