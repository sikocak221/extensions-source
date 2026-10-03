type Value = null | boolean | number | string | Value[] | { [key: string]: Value };

/** Parses a JavaScript object/array literal (unquoted keys, single quotes, trailing commas) starting at `start`. */
export function parseJsLiteral(source: string, start: number): Value {
  let pos = start;
  const fail = (message: string): never => {
    throw new Error(`${message} at position ${pos}`);
  };
  const peek = () => (pos < source.length ? source[pos]! : fail('Unexpected end of input'));
  const skip = () => {
    while (pos < source.length && /\s/.test(source[pos]!)) pos++;
  };
  const consume = (ch: string) => {
    if (source[pos] !== ch) return false;
    pos++;
    return true;
  };
  const expect = (ch: string) => {
    if (!consume(ch)) fail(`Expected '${ch}'`);
  };
  const identifier = () => {
    const begin = pos;
    while (pos < source.length && /[\w$]/.test(source[pos]!)) pos++;
    if (pos === begin) fail('Expected identifier');
    return source.slice(begin, pos);
  };
  const hex = (length: number) => {
    const value = Number.parseInt(source.slice(pos, pos + length), 16);
    if (Number.isNaN(value)) fail('Invalid hexadecimal escape');
    pos += length;
    return value;
  };
  const string = (): string => {
    const quote = source[pos++]!;
    let out = '';
    while (pos < source.length) {
      const ch = source[pos++]!;
      if (ch === quote) return out;
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const esc = source[pos++];
      switch (esc) {
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case 'v':
          out += '\v';
          break;
        case '0':
          out += '\0';
          break;
        case 'x':
          out += String.fromCharCode(hex(2));
          break;
        case 'u':
          if (consume('{')) {
            const end = source.indexOf('}', pos);
            out += String.fromCodePoint(Number.parseInt(source.slice(pos, end), 16));
            pos = end + 1;
          } else out += String.fromCharCode(hex(4));
          break;
        case '\n':
          break;
        case '\r':
          consume('\n');
          break;
        default:
          out += esc ?? '';
      }
    }
    return fail('Unterminated string');
  };
  const number = (): number => {
    const match = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(source.slice(pos, pos + 40));
    if (!match) fail('Invalid number');
    pos += match![0].length;
    return Number(match![0]);
  };
  const value = (): Value => {
    skip();
    const ch = peek();
    if (ch === '{') {
      pos++;
      const object: { [key: string]: Value } = {};
      skip();
      if (consume('}')) return object;
      for (;;) {
        skip();
        const key = source[pos] === '"' || source[pos] === "'" ? string() : identifier();
        skip();
        expect(':');
        object[key] = value();
        skip();
        if (consume('}')) break;
        expect(',');
        skip();
        if (consume('}')) break;
      }
      return object;
    }
    if (ch === '[') {
      pos++;
      const array: Value[] = [];
      skip();
      if (consume(']')) return array;
      for (;;) {
        array.push(value());
        skip();
        if (consume(']')) break;
        expect(',');
        skip();
        if (consume(']')) break;
      }
      return array;
    }
    if (ch === '"' || ch === "'") return string();
    if (/[-+.\d]/.test(ch)) return number();
    const word = identifier();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null' || word === 'undefined') return null;
    return fail(`Unsupported value '${word}'`);
  };
  return value();
}
