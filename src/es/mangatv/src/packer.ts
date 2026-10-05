// Unpacks Dean Edwards' p.a.c.k.e.r scripts ("eval(function(p,a,c,k,e,d){...}('...',62,84,'...'.split('|'),0,{}))")
// without evaluating them, since the sandbox has no eval.
const PACKED_ARGS = /}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\.split\('\|'\)/;

function encode(c: number, radix: number): string {
  const head = c < radix ? '' : encode(Math.floor(c / radix), radix);
  const digit = c % radix;
  return head + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
}

export function unpack(script: string): string {
  const match = PACKED_ARGS.exec(script);
  if (!match) throw new Error('Not a packed script');
  const payload = match[1]!.replace(/\\(.)/g, '$1');
  const radix = Number(match[2]);
  const count = Number(match[3]);
  const words = match[4]!.split('|');
  const dictionary = new Map<string, string>();
  for (let c = 0; c < count; c++) {
    const key = encode(c, radix);
    dictionary.set(key, words[c] || key);
  }
  return payload.replace(/\b\w+\b/g, (word) => dictionary.get(word) ?? word);
}

export function findPacked(text: string): string | undefined {
  const start = text.indexOf('eval(function(p,a,c,k,e,d)');
  if (start < 0) return undefined;
  const end = text.indexOf('</script>', start);
  return text.slice(start, end < 0 ? undefined : end);
}
