import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import {
  USER_AGENT,
  absoluteUrl,
  decodeEntities,
  findRscObject,
  hostOf,
  parseDate,
  relativeUrl,
  selectIgnoreCase,
} from './common/utils';

const BASE_URL = 'https://truyen18.co';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };

async function load(url: string): Promise<{ document: HtmlElement; body: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), body: response.body };
}

const pagedUrl = (path: string, page: number) => (page > 1 ? `${BASE_URL}${path}/page/${page}` : `${BASE_URL}${path}`);

/** Next.js serves images through `/_next/image?url=…`: the real address is the `url` parameter. */
function imageUrl(element: HtmlElement | null | undefined): string | undefined {
  const raw = element?.absUrl('src');
  if (!raw) return undefined;
  const param = /[?&]url=([^&]+)/.exec(raw)?.[1];
  if (!param) return raw;
  const decoded = decodeURIComponent(param);
  return decoded.startsWith('http') ? decoded : `${BASE_URL}${decoded.startsWith('/') ? '' : '/'}${decoded}`;
}

function mangaFromElement(link: HtmlElement, document: HtmlElement): MangaSummary {
  const path = link.attr('href') ?? '';
  // The cover is the image inside a link to the same series.
  const cover = document
    .select(`a[href="${path}"]`)
    .map((a) => a.selectFirst('img[src]'))
    .find((img) => img !== null);
  return {
    url: relativeUrl(link.absUrl('href') || path),
    title: link.selectFirst('h3')?.text() ?? '',
    thumbnailUrl: imageUrl(cover),
  };
}

function parseMangaPage(document: HtmlElement): MangaPage {
  const seen = new Set<string>();
  const items = document
    .select('main a[href^="/doc-truyen"]:has(h3)')
    .map((link) => mangaFromElement(link, document))
    .filter((m) => !seen.has(m.url) && seen.add(m.url));
  return { items, hasNextPage: document.selectFirst('link[rel=next]') !== null };
}

function infoValue(document: HtmlElement, label: string): string | undefined {
  const row = document.select('main span').find((s) => s.text().toLowerCase() === `${label}:`.toLowerCase());
  if (!row) return undefined;
  // The value follows the label in the same row.
  return selectIgnoreCase(document, `main span:contains(${label}:) + *`)[0]?.text();
}

function parseStatus(text?: string): MangaStatus {
  const status = text?.toLowerCase() ?? '';
  if (status.includes('đang tiến hành') || status.includes('đang cập nhật')) return 'ongoing';
  if (status.includes('hoàn thành')) return 'completed';
  return 'unknown';
}

function relativeDate(text: string): number | undefined {
  if (text.includes('vừa xong')) return Date.now();
  const amount = Number.parseInt(/\d+/.exec(text)?.[0] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
  const units: [string, number][] = [
    ['giây', 1000],
    ['phút', 60_000],
    ['giờ', 3_600_000],
    ['ngày', 86_400_000],
    ['tuần', 7 * 86_400_000],
    ['tháng', 30 * 86_400_000],
    ['năm', 365 * 86_400_000],
  ];
  const unit = units.find(([name]) => text.includes(name));
  return unit ? Date.now() - amount * unit[1] : undefined;
}

function chapterDate(text?: string): number | undefined {
  if (!text?.trim()) return undefined;
  const relative = relativeDate(text.toLowerCase());
  if (relative !== undefined) return relative;
  const date = parseDate(text.trim(), 'dd/MM/yyyy');
  return date === undefined ? undefined : date - VIETNAM_OFFSET;
}

/**
 * The chapter's html sits in a Next.js "outlined text" row (`<id>:T<byte length>,<text>`) that the chapter
 * object points to with `"content":"$<id>"`.
 */
function chapterContent(body: string, slug: string): string | undefined {
  let rsc = '';
  for (const push of body.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      rsc += JSON.parse(push[1]!) as string;
    } catch {
      // Not a text chunk.
    }
  }
  const refs = [
    ...rsc.matchAll(
      new RegExp(`"slug":"${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}","content":"\\$([0-9a-f]+)"`, 'g'),
    ),
  ].map((m) => m[1]!);
  for (const id of new Set(refs)) {
    const row = new RegExp(`(?:^|\n)${id}:T([0-9a-f]+),`).exec(rsc);
    if (!row) continue;
    const length = Number.parseInt(row[1]!, 16);
    // The length counts UTF-8 bytes.
    let end = row.index + row[0].length;
    let bytes = 0;
    while (end < rsc.length && bytes < length) {
      const code = rsc.codePointAt(end)!;
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      end += code > 0xffff ? 2 : 1;
    }
    const text = rsc.slice(row.index + row[0].length, end);
    if (text.trim()) return text;
  }
  return undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaPage((await load(pagedUrl('/xem-nhieu-nhat', page))).document),
    getLatest: async (page) => parseMangaPage((await load(pagedUrl('/moi-cap-nhat', page))).document),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim())
        return parseMangaPage(
          (
            await load(
              `${BASE_URL}${page > 1 ? `/search/page/${page}` : '/search'}?q=${encodeURIComponent(query.trim())}`,
            )
          ).document,
        );
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : undefined;
      return parseMangaPage(
        (await load(genre ? pagedUrl(`/category/${genre}`, page) : pagedUrl('/xem-nhieu-nhat', page))).document,
      );
    },
    async getFilters(): Promise<Filter[]> {
      try {
        // The home page is large: read the category links from the text.
        const { body } = await load(BASE_URL);
        const from = body.indexOf('Danh sách thể loại');
        const seen = new Set<string>();
        const genres = [
          ...(from < 0 ? '' : body.slice(from)).matchAll(
            /<a [^>]*href="[^"]*\/category\/([^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/g,
          ),
        ].flatMap(([, slug, inner]) => {
          const label = decodeEntities((inner ?? '').replace(/<[^>]+>/g, '')).trim();
          if (!label || !slug || seen.has(slug)) return [];
          seen.add(slug);
          return [{ label, value: slug }];
        });
        return genres.length
          ? [
              { type: 'header', label: 'Lọc theo thể loại từ Danh sách thể loại' },
              {
                type: 'select',
                id: 'genre',
                label: 'Thể loại',
                options: [{ label: 'Tất cả', value: '' }, ...genres],
                default: '',
              },
            ]
          : [];
      } catch (error) {
        log.warn('Cannot load genres', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      const genres = [
        ...new Set(document.select("main a[href*='/category/'], main a[href*='/tag/']").map((a) => a.text())),
      ];
      const description = selectIgnoreCase(document, 'main p:contains(Nội dung cập nhật)')
        .map((p) => p.text())
        .find((t) => t.startsWith('Nội dung cập nhật'));
      return {
        url: manga.url,
        title: document.selectFirst('main h1')?.text() || manga.title,
        thumbnailUrl: imageUrl(document.selectFirst('main img[alt][src]')) ?? manga.thumbnailUrl,
        author: infoValue(document, 'Tác giả'),
        status: parseStatus(infoValue(document, 'Trạng thái')),
        genres,
        description,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { body } = await load(absoluteUrl(BASE_URL, manga.url));
      const from = body.indexOf('Danh sách chương');
      if (from < 0) return [];
      // Each row has three links to the chapter, then "Đăng lúc: <date>": read the text, not one bridge call per field.
      const seen = new Set<string>();
      const chapters: Chapter[] = [];
      for (const [, title, href, date] of body
        .slice(from)
        .matchAll(/<a title="([^"]*)" href="([^"]*\/chapter-[^"]*)">[\s\S]*?Đăng lúc: (?:<!-- -->)?([^<]*)</g)) {
        const url = relativeUrl(decodeEntities(href!));
        if (seen.has(url)) continue;
        seen.add(url);
        const full = decodeEntities(title!);
        chapters.push({
          url,
          name: (full.includes(' - ') ? full.split(' - ').pop()! : full).trim(),
          uploadedAt: chapterDate(date),
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const slug = chapter.url.split('?')[0]!.split('/').filter(Boolean).pop() ?? '';
      const { body } = await load(absoluteUrl(BASE_URL, chapter.url));
      const content = chapterContent(body, slug);
      if (!content) return [];
      return html
        .load(content, { baseUrl: BASE_URL })
        .select('img[src]')
        .map((img) => img.absUrl('src'))
        .filter((url) => url && !url.endsWith('/bn.png'))
        .map((url, index) => ({ index, imageUrl: url }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/doc-truyen\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/doc-truyen/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
