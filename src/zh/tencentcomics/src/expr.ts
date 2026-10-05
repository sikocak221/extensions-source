// Evaluates the small JS expressions the reader page hides its nonce in, e.g. `Math.round(.5) + ~~1.6`,
// `1 * (!window.Array) + 1`, `0<=3?2:1` (the sandbox has no eval). Browser globals (window, document,
// navigator, …) are truthy stubs, as in a real browser.

type Value = number | boolean | string | object | ((...args: Value[]) => Value) | undefined;

const BROWSER = new Proxy({}, { get: () => BROWSER });
const MATH: Record<string, Value> = {
  round: (x) => Math.round(Number(x)),
  floor: (x) => Math.floor(Number(x)),
  ceil: (x) => Math.ceil(Number(x)),
  abs: (x) => Math.abs(Number(x)),
  pow: (x, y) => Number(x) ** Number(y),
  max: (...xs) => Math.max(...xs.map(Number)),
  min: (...xs) => Math.min(...xs.map(Number)),
  sqrt: (x) => Math.sqrt(Number(x)),
  PI: Math.PI,
};
const GLOBALS: Record<string, Value> = {
  Math: MATH,
  parseInt: (x, radix) => parseInt(String(x), radix === undefined ? undefined : Number(radix)),
  parseFloat: (x) => parseFloat(String(x)),
  Number: (x) => Number(x),
  true: true,
  false: false,
  undefined,
  NaN,
  Infinity,
};

const TOKEN =
  /\s*(\d*\.\d+(?:e[+-]?\d+)?|\d+(?:e[+-]?\d+)?|[A-Za-z_$][\w$]*|"[^"]*"|'[^']*'|===|!==|==|!=|<=|>=|&&|\|\||>>>|<<|>>|[-+*/%!~<>?:(),.\[\]&|^])/gy;

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (TOKEN.lastIndex < source.length && (match = TOKEN.exec(source))) tokens.push(match[1]!);
  if (source.slice(TOKEN.lastIndex).trim()) throw new Error(`unsupported expression: ${source}`);
  return tokens;
}

const num = (v: Value) => Number(v);
const truthy = (v: Value) => Boolean(v);

const BINARY: [string[], (a: Value, b: Value, op: string) => Value][] = [
  [['||'], (a, b) => (truthy(a) ? a : b)],
  [['&&'], (a, b) => (truthy(a) ? b : a)],
  [['|'], (a, b) => num(a) | num(b)],
  [['^'], (a, b) => num(a) ^ num(b)],
  [['&'], (a, b) => num(a) & num(b)],
  [
    ['==', '!=', '===', '!=='],
    (a, b, op) => {
      const eq = op.length === 3 ? a === b : a == b; // eslint-disable-line eqeqeq
      return op[0] === '=' ? eq : !eq;
    },
  ],
  [
    ['<', '<=', '>', '>='],
    (a, b, op) =>
      op === '<' ? num(a) < num(b) : op === '<=' ? num(a) <= num(b) : op === '>' ? num(a) > num(b) : num(a) >= num(b),
  ],
  [
    ['<<', '>>', '>>>'],
    (a, b, op) => (op === '<<' ? num(a) << num(b) : op === '>>' ? num(a) >> num(b) : num(a) >>> num(b)),
  ],
  [
    ['+', '-'],
    (a, b, op) =>
      op === '-'
        ? num(a) - num(b)
        : typeof a === 'string' || typeof b === 'string'
          ? String(a) + String(b)
          : num(a) + num(b),
  ],
  [['*', '/', '%'], (a, b, op) => (op === '*' ? num(a) * num(b) : op === '/' ? num(a) / num(b) : num(a) % num(b))],
];

/** `object.name`, with methods bound to their receiver (`'1'.charCodeAt()`). */
function member(object: Value, name: string): Value {
  if (object === BROWSER) return BROWSER;
  if (object === undefined || object === null) throw new TypeError(`cannot read ${name} of ${object}`);
  const value = (object as Record<string, Value>)[name];
  return typeof value === 'function' && !(name in MATH) ? (value as (...a: Value[]) => Value).bind(object) : value;
}

export function evaluate(source: string): Value {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (expected?: string) => {
    const token = tokens[pos++];
    if (expected !== undefined && token !== expected) throw new Error(`expected ${expected} in ${source}`);
    return token;
  };

  function ternary(): Value {
    const condition = binary(0);
    if (peek() !== '?') return condition;
    take();
    const yes = ternary();
    take(':');
    const no = ternary();
    return truthy(condition) ? yes : no;
  }

  function binary(level: number): Value {
    if (level === BINARY.length) return unary();
    const [ops, apply] = BINARY[level]!;
    let left = binary(level + 1);
    while (ops.includes(peek() ?? '')) {
      const op = take()!;
      left = apply(left, binary(level + 1), op);
    }
    return left;
  }

  function unary(): Value {
    const token = peek();
    if (token === '!') return (take(), !truthy(unary()));
    if (token === '~') return (take(), ~num(unary()));
    if (token === '-') return (take(), -num(unary()));
    if (token === '+') return (take(), num(unary()));
    if (token === 'typeof') return (take(), typeof unary());
    return postfix(primary());
  }

  function postfix(value: Value): Value {
    for (;;) {
      if (peek() === '.') {
        take();
        value = member(value, take()!);
      } else if (peek() === '[') {
        take();
        const key = String(ternary());
        take(']');
        value = member(value, key);
      } else if (peek() === '(') {
        take();
        const args: Value[] = [];
        while (peek() !== ')') {
          args.push(ternary());
          if (peek() === ',') take();
        }
        take(')');
        value = value === BROWSER ? BROWSER : (value as (...a: Value[]) => Value)(...args);
      } else return value;
    }
  }

  function primary(): Value {
    const token = take();
    if (token === undefined) throw new Error(`unexpected end of ${source}`);
    if (token === '(') {
      const value = ternary();
      take(')');
      return value;
    }
    if (/^[\d.]/.test(token)) return Number(token);
    if (token[0] === '"' || token[0] === "'") return token.slice(1, -1);
    if (token in GLOBALS) return GLOBALS[token];
    return BROWSER; // window, document, navigator, location, …
  }

  const value = ternary();
  if (pos !== tokens.length) throw new Error(`unsupported expression: ${source}`);
  return value;
}

/** The nonce assignment: string literals joined with `(+eval("…")).toString()` pieces. */
export function evaluateNonce(expression: string): string {
  let out = '';
  for (const m of expression.matchAll(/"((?:[^"\\]|\\.)*)"|\(\+eval\("((?:[^"\\]|\\.)*)"\)\)\.toString\(\)/g)) {
    out += m[2] !== undefined ? String(Number(evaluate(m[2]))) : m[1]!;
  }
  return out;
}
