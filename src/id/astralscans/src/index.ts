import { type Chapter, type HtmlElement, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class AstralScans extends MangaThemesia {
  readonly name = 'Astral Scans';
  readonly baseUrl = 'https://astralscans.site';

  override hasProjectPage = true;

  // The chapter list is loaded by a script on the manga page: a POST to the same url whose answer is
  // obfuscated. The form field and header are read from that script, so small changes keep working.
  override async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const url = this.absolute(manga.url);
    const page = await http.get(url, { headers: this.headers() });
    const script = page.body;
    const field = /formData\.append\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/.exec(script);
    const header = /headers:\s*\{\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/.exec(script);
    const form = field ? { [field[1]!]: field[2]! } : { ts_action: 'get_chapters' };
    const headers: Record<string, string> = { ...this.headers(), 'X-Requested-With': 'XMLHttpRequest' };
    if (header) headers[header[1]!] = header[2]!;
    else headers['X-Protect'] = '1';
    const response = await http.post(url, { form }, { headers });
    return this.parseChapters(response.body, script);
  }

  async parseChapters(raw: string, pageHtml = ''): Promise<Chapter[]> {
    const text = raw.trim();
    const decoded = this.decodePayload(text);
    if (decoded) {
      const [rawHtml, attr] = decoded;
      const chapters = html
        .load(rawHtml, { baseUrl: this.baseUrl })
        .select(`[${attr}]`)
        .flatMap((element): Chapter[] => {
          const encoded = element.attr(attr) ?? '';
          let url = encoded;
          try {
            url = base64.decode(encoded);
          } catch {
            url = encoded;
          }
          const spans = element.select('span');
          const name = spans[0]?.text() || element.text() || 'Chapter';
          const date = spans[1]?.text();
          const isTrap =
            url.includes('chp_trap') ||
            /trap/i.test(name) ||
            /trap/i.test(date ?? '') ||
            (element.attr('class') ?? '').includes('trap');
          if (isTrap || !url) return [];
          return [{ url: this.toRelative(url), name, uploadedAt: this.parseChapterDate(date) }];
        });
      if (chapters.length > 0) return chapters;
    }
    return super.chapterListParse(html.load(pageHtml || text, { baseUrl: this.baseUrl }));
  }

  /** [html, attribute] from an "ASX_" (rot13 → base64 → reversed, "|||") or "AST_" (reversed → base64, "^^^") answer. */
  decodePayload(text: string): [string, string] | null {
    try {
      if (text.startsWith('ASX_')) {
        const rot13 = text.slice(4).replace(/[a-zA-Z]/g, (c) => {
          const base = c <= 'Z' ? 65 : 97;
          return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
        });
        const [rawHtml, attr] = base64.decode(rot13).split('').reverse().join('').split('|||');
        return rawHtml && attr ? [rawHtml, attr] : null;
      }
      if (text.startsWith('AST_')) {
        const [rawHtml, attr] = base64.decode(text.slice(4).split('').reverse().join('')).split('^^^');
        return rawHtml && attr ? [rawHtml, attr] : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  override async chapterListParse(document: HtmlElement): Promise<Chapter[]> {
    const text = document.selectFirst('body')?.text() ?? '';
    if (/^AS[TX]_/.test(text)) return this.parseChapters(text);
    return super.chapterListParse(document);
  }

  override chapterListSelector(): string {
    return 'div#kumpulan-bab-area .astral-item, div.eplister li';
  }

  override chapterFromElement(element: HtmlElement): Chapter {
    const dataU = element.selectFirst('.js-link')?.attr('data-u') ?? '';
    const url = dataU ? base64.decode(dataU) : (element.selectFirst('a')?.attr('href') ?? '');
    return {
      url: this.toRelative(url),
      name: element.selectFirst('.ch-title, .epl-num, .chapternum')?.text() ?? '',
      uploadedAt: this.parseChapterDate(element.selectFirst('.ch-date, .chapterdate')?.text()),
    };
  }
}

export default defineExtension({
  createSource: () => new AstralScans().toSource(),
});
