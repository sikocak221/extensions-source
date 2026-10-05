// LZString.decompressFromBase64 (pieroxy/lz-string, MIT), as used by the site's reader and hidden chapter lists.
const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function decompressFromBase64(input: string): string {
  if (!input) return '';
  const value = (index: number) => KEY.indexOf(input.charAt(index));
  const dictionary: string[] = ['0', '1', '2'];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  const result: string[] = [];
  const data = { val: value(0), position: 32, index: 1 };

  const bits = (count: number) => {
    let out = 0;
    for (let power = 1; power !== 2 ** count; power *= 2) {
      const bit = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = 32;
        data.val = value(data.index++);
      }
      if (bit > 0) out |= power;
    }
    return out;
  };

  const first = bits(2);
  if (first > 1) return '';
  let w = String.fromCharCode(bits(first === 0 ? 8 : 16));
  dictionary[3] = w;
  result.push(w);
  for (;;) {
    if (data.index > input.length) return '';
    let code = bits(numBits);
    if (code === 2) return result.join('');
    if (code < 2) {
      dictionary[dictSize++] = String.fromCharCode(bits(code === 0 ? 8 : 16));
      code = dictSize - 1;
      if (--enlargeIn === 0) enlargeIn = 2 ** numBits++;
    }
    let entry: string;
    if (dictionary[code] !== undefined) entry = dictionary[code]!;
    else if (code === dictSize) entry = w + w.charAt(0);
    else return '';
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    w = entry;
    if (--enlargeIn === 0) enlargeIn = 2 ** numBits++;
  }
}
