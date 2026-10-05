import type {
  Chapter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
} from '@matane/extension-sdk';
import { defineExtension } from '@matane/extension-sdk';
import { MCCMSWeb, removePathPrefix } from './mccms/MCCMSWeb';

const SEARCH_PAGES = 10;

const PAGE_KEYS = [
  '8-bXd9iN',
  '8-RXyjry',
  '8-oYvwVy',
  '8-4ZY57U',
  '8-mbJpU7',
  '8-6MM2Ei',
  '8-54TiQr',
  '8-Ph5xx9',
  '8-bYgePR',
  '8-Z9A3bW',
];

// This site shares the same database with 6Manhua (SixMH), but uses manga slug as URL.
class Miaoqu extends MCCMSWeb {
  readonly name = 'Miaoqu Manhua';
  readonly baseUrl = 'https://www.miaoqumh.org';

  // There's no genre list to parse, so the genres come from the mobile page (see fetchGenresPage).
  override parseListing(document: HtmlElement, url: string): MangaPage {
    const items = document.select('#mangawrap > *').flatMap((element): MangaSummary[] => {
      const image = element.selectFirst('a');
      const style = image?.attr('style') ?? '';
      const start = style.indexOf('background: url(');
      const thumbnail = start < 0 ? undefined : style.slice(start + 16).split(')')[0];
      return [
        {
          url: image?.attr('href') ?? '',
          title: element.selectFirst('.manga-name')?.text() ?? '',
          thumbnailUrl: thumbnail || undefined,
        },
      ];
    });
    const next = document.selectFirst('#next');
    const hasNextPage =
      next != null && (next.attr('href') ?? '').split('/').pop() !== url.split('?')[0]!.split('/').pop();
    return { items, hasNextPage };
  }

  // The site's own search answers 404 (Tachiyomi shows an error): filter the first pages of the catalogue instead.
  override async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    if (!query.trim()) return super.search(query, page, filters);
    if (page > 1) return { items: [], hasNextPage: false };
    const needle = query.trim().toLowerCase();
    const items: MangaSummary[] = [];
    for (let next = 1; next <= SEARCH_PAGES; next++) {
      const result = await this.getPopular(next);
      items.push(...result.items.filter((m) => m.title.toLowerCase().includes(needle)));
      if (!result.hasNextPage) break;
    }
    return { items, hasNextPage: false };
  }

  // Use the mobile page.
  override async fetchMangaPage(manga: MangaSummary): Promise<HtmlElement> {
    return this.fetchDocument(`${this.mobileUrl(this.baseUrl)}${manga.url}`, this.mobileHeaders());
  }

  override mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details: MangaDetails = { url: manga.url, title: manga.title, status: 'unknown' };
    let description = document.selectFirst('.text')?.text() ?? '';
    const infobox = document.selectFirst('.infobox');
    details.title = infobox?.selectFirst('.title')?.text() || manga.title;
    details.thumbnailUrl = infobox?.selectFirst('img')?.attr('src') || manga.thumbnailUrl;
    for (const element of infobox?.select('.tage') ?? []) {
      const text = element.text();
      switch (text.slice(0, 3)) {
        case '作者：':
          details.author = text.slice(3).trimStart();
          break;
        case '类型：':
          details.genres = element.select('a').map((a) => a.text());
          break;
        case '更新于':
          description = `${text}\n\n${description}`;
          break;
      }
    }
    details.description = description || undefined;
    return details;
  }

  override chapterListSelector(): string {
    return 'ul.list > li';
  }

  // Might answer HTTP 500 with the page data.
  override async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.request({ url: `${this.baseUrl}${chapter.url}`, headers: this.pcHeaders() });
    return this.pageListParse(response.body as string, response.url);
  }

  override pageListParse(body: string, url: string): Page[] {
    const cid = Number.parseInt(
      url
        .split('?')[0]!
        .split('/')
        .pop()!
        .replace(/\.html$/, ''),
      10,
    );
    const key = utf8.encode(PAGE_KEYS[cid % 10] ?? '');
    if (key.length !== 8) throw new Error(`Illegal cid: ${cid}`);
    const marker = "var DATA='";
    const start = body.indexOf(marker);
    if (start < 0) throw new Error(`string doesn't match ${marker}[...]'`);
    const data = body.slice(start + marker.length).split("'")[0]!;
    const bytes = [...base64.decodeBytes(data)].map((byte, i) => byte ^ key[i & 7]!);
    const decrypted = base64.decode(utf8.decode(bytes));
    return (JSON.parse(decrypted) as { url: string }[]).map((image, index) => ({ index, imageUrl: image.url }));
  }

  override async fetchGenresPage(): Promise<HtmlElement> {
    return this.fetchDocument(`${this.mobileUrl(this.baseUrl)}/category/`, this.mobileHeaders());
  }

  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/(?:www\.|m\.)?miaoqumh\.org(\/[^/?#]+)\/?$/i.exec(url.trim());
    return match ? { url: removePathPrefix(match[1]!), title: '' } : null;
  }
}

export default defineExtension({
  createSource: () => new Miaoqu().toSource(),
});
