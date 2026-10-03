// Helpers shared by the theme templates. Single source: lib-multisrc/common/src/utils.ts.
// `node scripts/sync-multisrc.mjs` copies it into every lib-multisrc/<theme>/src/utils.ts and from
// there into the extensions (standalone extensions keep it in src/common/). Covers what the sandbox
// lacks compared to Kotlin/Jsoup: no URL class, case-sensitive `:contains`, no ownText(), Java date
// patterns.
import type { HtmlElement } from '@matane/extension-sdk';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

export function hostOf(url: string): string {
  return /^(?:https?:)?\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
}

/** Path (+ query) of an absolute or relative url, like Tachiyomi's setUrlWithoutDomain. */
export function relativeUrl(url: string): string {
  const value = url.trim().replace(/#.*$/, '');
  if (!value) return '';
  const path = value.replace(/^(?:https?:)?\/\/[^/?#]+/i, '');
  return path.startsWith('/') ? path : `/${path}`;
}

/** Absolute url of a path on `baseUrl`. */
export function absoluteUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Sets (replaces) query parameters of a url; empty values are kept, undefined ones skipped. */
export function withQuery(url: string, params: Record<string, string | undefined>): string {
  const [path = '', search = ''] = url.split('?');
  const kept = search.split('&').filter((pair) => pair && !(decodeURIComponent(pair.split('=')[0] ?? '') in params));
  const added = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  const query = [...kept, ...added].join('&');
  return query ? `${path}?${query}` : path;
}

/** First image url of an element from the usual lazy-loading attributes. */
export function imgAttr(
  element: HtmlElement | null | undefined,
  attributes = ['data-lazy-src', 'data-src', 'data-cfsrc', 'src'],
): string {
  if (!element) return '';
  for (const name of attributes) {
    const value = element.attr(name)?.trim();
    if (value && !value.startsWith('data:')) return element.absUrl(name) || value;
  }
  return '';
}

export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const char of selector) {
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** `a, b` + `img` → `a img, b img` */
export function descendants(selector: string, child: string): string {
  return splitSelectorList(selector)
    .map((part) => `${part} ${child}`)
    .join(', ');
}

/** select() where `:contains(x)` matches case-insensitively, as in Jsoup. */
export function selectIgnoreCase(root: HtmlElement, selector: string): HtmlElement[] {
  if (!selector.includes(':contains(')) return root.select(selector);
  const variants = new Set<string>();
  for (const part of splitSelectorList(selector)) {
    for (const transform of [
      (s: string) => s,
      (s: string) => s.toLowerCase(),
      (s: string) => s.toUpperCase(),
      (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
    ]) {
      variants.add(part.replace(/:contains\(([^)]*)\)/g, (_, text: string) => `:contains(${transform(text)})`));
    }
  }
  return root.select([...variants].join(', '));
}

export function selectFirstIgnoreCase(root: HtmlElement, selector: string): HtmlElement | null {
  return selectIgnoreCase(root, selector)[0] ?? null;
}

/** Text of the element without the text of its child elements (Jsoup ownText). */
export function ownText(element: HtmlElement | null | undefined): string {
  if (!element) return '';
  let text = element
    .html()
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  let previous;
  do {
    previous = text;
    text = text.replace(/<([a-zA-Z][\w-]*)\b[^>]*>[^<]*<\/\1\s*>/g, ' ');
  } while (text !== previous);
  return decodeEntities(text.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

/** Html fragment → plain text with paragraph breaks. */
export function htmlToText(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*(\n\s*)+/g, '\n\n')
    .trim();
}

// Month names (full and short) in the languages these sites use.
const MONTHS: Record<string, number> = {};
[
  ['january', 'jan', 'januari', 'enero', 'janvier', 'janeiro'],
  ['february', 'feb', 'februari', 'febrero', 'février', 'fevereiro', 'pebruari', 'peb'],
  ['march', 'mar', 'maret', 'marzo', 'mars', 'março'],
  ['april', 'apr', 'abril', 'avril'],
  ['may', 'mei', 'mayo', 'mai', 'maio'],
  ['june', 'jun', 'juni', 'junio', 'juin', 'junho'],
  ['july', 'jul', 'juli', 'julio', 'juillet', 'julho'],
  ['august', 'aug', 'agustus', 'agu', 'agt', 'agus', 'agosto', 'août', 'ago'],
  ['september', 'sep', 'sept', 'septiembre', 'septembre', 'setembro'],
  ['october', 'oct', 'oktober', 'okt', 'octubre', 'octobre', 'outubro', 'out'],
  ['november', 'nov', 'noviembre', 'novembre', 'novembro', 'nop'],
  ['december', 'dec', 'desember', 'des', 'diciembre', 'décembre', 'dezembro', 'dez'],
].forEach((names, month) => {
  for (const name of names) MONTHS[name] = month;
});

/**
 * Parses a date written with a Java DateTimeFormatter pattern subset (d, dd, M, MM, MMM, MMMM, yy,
 * yyyy, H/HH, h, mm, ss, a; E is skipped). Month names in English and Indonesian (and a few more).
 * Without a year in the pattern, the current year. Epoch ms in UTC, or undefined.
 */
export function parseDate(text: string | null | undefined, pattern: string): number | undefined {
  if (!text) return undefined;
  const tokens = pattern.match(/(d+|M+|y+|H+|h+|m+|s+|a|E+|'[^']*'|[^dMyHhmsaE']+)/g) ?? [];
  let regex = '';
  const fields: string[] = [];
  for (const token of tokens) {
    const letter = token[0];
    if (letter === "'") regex += escapeRegex(token.slice(1, -1));
    else if (letter === 'M' && token.length >= 3) {
      regex += '([^\\s\\d.,/-]+)\\.?';
      fields.push('monthName');
    } else if (letter === 'E') regex += '[^\\s\\d.,]+';
    else if (letter === 'a') {
      regex += '([ap]\\.?m\\.?)';
      fields.push('ampm');
    } else if ('dMyHhms'.includes(letter ?? '')) {
      regex += '(\\d{1,4})';
      fields.push(letter ?? '');
    } else regex += escapeRegex(token).replace(/\s+/g, '\\s*');
  }
  const match = new RegExp(regex, 'i').exec(text.trim());
  if (!match) return undefined;
  let year = new Date().getUTCFullYear();
  let month = 0;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let pm: boolean | undefined;
  fields.forEach((field, i) => {
    const value = match[i + 1] ?? '';
    const number = Number.parseInt(value, 10);
    if (field === 'monthName') {
      const name = value.toLowerCase().replace(/\.$/, '');
      month = MONTHS[name] ?? MONTHS[name.slice(0, 3)] ?? Number.NaN;
    } else if (field === 'M') month = number - 1;
    else if (field === 'd') day = number;
    else if (field === 'y') year = value.length <= 2 ? 2000 + number : number;
    else if (field === 'H' || field === 'h') hour = number;
    else if (field === 'm') minute = number;
    else if (field === 's') second = number;
    else if (field === 'ampm') pm = value.toLowerCase().startsWith('p');
  });
  if (pm && hour < 12) hour += 12;
  if (pm === false && hour === 12) hour = 0;
  const time = Date.UTC(year, month, day, hour, minute, second);
  return Number.isNaN(time) ? undefined : time;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
