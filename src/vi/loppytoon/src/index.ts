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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://loppytoonn.com';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };

const SORTS = [
  ['newest', 'Mới nhất'],
  ['views', 'Xem nhiều nhất'],
] as const;

interface FilterGroup {
  name: string;
  options: { name: string; id: string }[];
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

/** Some covers come as "https://proxy/https://real": keep the real address. */
function normalizeThumbnail(url?: string): string | undefined {
  if (!url) return undefined;
  const second = url.indexOf('https://', 'https://'.length);
  return second === -1 ? url : url.slice(second);
}

function isNovel(url: string): boolean {
  const path = relativeUrl(url).split('/').filter(Boolean);
  return path[0] === 'truyen' && (path[1] ?? '').split('-').some((part) => part.toLowerCase() === 'novel');
}

function mangaFromElement(element: HtmlElement): MangaSummary | null {
  const link = element.selectFirst('a.story-result-title, a.story-result-cover, a');
  if (!link) return null;
  const href = link.absUrl('href') || link.attr('href') || '';
  if (isNovel(href)) return null;
  const title =
    element.selectFirst('a.story-result-title, h3.comic-title')?.text() ||
    element.selectFirst('img')?.attr('alt') ||
    '';
  if (!title) return null;
  return {
    url: relativeUrl(href),
    title,
    thumbnailUrl: normalizeThumbnail(
      element.selectFirst('a.story-result-cover img, .comic-cover img, img')?.absUrl('src'),
    ),
  };
}

function parseMangaPage(document: HtmlElement): MangaPage {
  return {
    items: document.select('div.story-result-item, div.comic-item').flatMap((e) => mangaFromElement(e) ?? []),
    hasNextPage:
      document.selectFirst('a[rel=next], a[aria-label*=Next]') !== null ||
      selectIgnoreCase(document, 'a:contains(Next »)').length > 0,
  };
}

function relativeDate(value: string): number | undefined {
  const amount = Number.parseInt(/(\d+)/.exec(value)?.[1] ?? '', 10);
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
  const unit = units.find(([name]) => value.includes(name));
  return unit ? Date.now() - amount * unit[1] : undefined;
}

function toDate(text?: string): number | undefined {
  const value = text?.trim();
  if (!value) return undefined;
  const date = parseDate(value, 'dd/MM/yyyy');
  return date !== undefined ? date - VIETNAM_OFFSET : relativeDate(value);
}

function parseChapters(document: HtmlElement): Chapter[] {
  return document.select('li.chapter-item, li.episode-item, a.chapter-item').flatMap((element): Chapter[] => {
    const link =
      element.attr('href') !== undefined && element.selectFirst('a') === null
        ? element
        : (element.selectFirst('div.episode-title a, a[href]') ?? element);
    const href = link.absUrl('href');
    if (!href) return [];
    const name = (element.selectFirst('h3')?.text() || link.text()).replace(/\s+/g, ' ').trim();
    if (!name) return [];
    return [{ url: relativeUrl(href), name, uploadedAt: toDate(element.selectFirst('span.chapter-date')?.text()) }];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaPage(await load(`${BASE_URL}/the-loai?type=1&sort=views&page=${page}`)),
    getLatest: async (page) => parseMangaPage(await load(`${BASE_URL}/the-loai?page=${page}`)),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const results = (
          await http.get<{ slug: string; title: string; cover?: string | null }[]>(
            `${BASE_URL}/api/search-story?keyword=${encodeURIComponent(query.trim())}`,
            { headers, responseType: 'json' },
          )
        ).body;
        const items = results.flatMap((r): MangaSummary[] => {
          const url = `/truyen/${r.slug}`;
          if (isNovel(url) || !r.title) return [];
          const cover = r.cover ? (r.cover.startsWith('http') ? r.cover : `${BASE_URL}/storage/${r.cover}`) : undefined;
          return [{ url, title: r.title, thumbnailUrl: normalizeThumbnail(cover) }];
        });
        return { items, hasNextPage: false };
      }
      const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : 'newest';
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice(6));
      const params = [`type=1`, `sort=${sort}`, `page=${page}`];
      if (filters.excludeAdult === true) params.push('exclude_adult=1');
      if (genres.length) params.push(`genres=${encodeURIComponent(genres.join(','))}`);
      return parseMangaPage(await load(`${BASE_URL}/the-loai?${params.join('&')}`));
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp theo',
          options: SORTS.map(([value, label]) => ({ value, label })),
          default: 'newest',
        },
        { type: 'checkbox', id: 'excludeAdult', label: 'Loại trừ 19+' },
      ];
      try {
        const document = await load(`${BASE_URL}/the-loai?type=1`);
        const groups: FilterGroup[] = document.select('.filter-table .frow').flatMap((row): FilterGroup[] => {
          const label = row.selectFirst('.flabel')?.text().trim();
          if (!label) return [];
          const isCategory = label.toLowerCase().includes('phân loại');
          const options = row.select('.fchips .gchip[data-id]').flatMap((chip) => {
            const id = (chip.attr('data-id') ?? '').trim();
            const name = chip.text().trim();
            if (!id || !name || (isCategory && name.toLowerCase() === 'light novel')) return [];
            return [{ name, id }];
          });
          return options.length ? [{ name: label, options }] : [];
        });
        groups.forEach((group, index) =>
          filters.push({
            type: 'group',
            id: `group${index}`,
            label: group.name,
            filters: group.options.map((o): Filter => ({ type: 'checkbox', id: `genre.${o.id}`, label: o.name })),
          }),
        );
      } catch (error) {
        log.warn('Cannot load filters', error);
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const labelled = (label: string, rowSelector: string) =>
        selectIgnoreCase(
          document,
          `${rowSelector}:has(.info-label:contains(${label})) .info-value, span.meta-label:contains(${label}) + *`,
        )[0]?.text();
      const altName =
        document.selectFirst('div.other-name p, div.other-name')?.text() ||
        selectIgnoreCase(document, 'span.meta-label:contains(Tên khác) + *')[0]?.text();
      const descriptionElement = document.selectFirst('div.description, #desc, div.manga-description');
      const paragraphs = descriptionElement
        ?.select('p')
        .map((p) => p.text())
        .filter(Boolean)
        .join('\n\n');
      const descriptionText = paragraphs || descriptionElement?.text() || '';
      const statusText = labelled('Tình trạng', '.info-row')?.toLowerCase() ?? '';
      const status: MangaStatus =
        statusText.includes('ongoing') || statusText.includes('dang-tien-hanh')
          ? 'ongoing'
          : statusText.includes('completed') || statusText.includes('hoan-thanh')
            ? 'completed'
            : 'unknown';
      const seen = new Set<string>();
      return {
        url: manga.url,
        title: document.selectFirst('div.info-title h2, h1.manga-title, div.info-title')?.text() || manga.title,
        author: labelled('Tác giả', '.info-row'),
        genres: document
          .select(".tags a[href*='/the-loai/'], a[href*='/the-loai/'], .manga-tags a.tag")
          .map((a) => a.text().replace(/^#/, '').trim())
          .filter((g) => g && !seen.has(g) && seen.add(g)),
        thumbnailUrl:
          normalizeThumbnail(
            document
              .selectFirst('.info-cover img.main-img, .info-cover img:not(.blur-bg), img.cover-image')
              ?.absUrl('src'),
          ) ?? manga.thumbnailUrl,
        description: (altName ? `Tên khác: ${altName}\n${descriptionText}` : descriptionText) || undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters = parseChapters(document);
      const slug = relativeUrl(manga.url).split('/').filter(Boolean)[1];
      if (!slug) return chapters;
      let offset = chapters.length;
      let hasMore = document.selectFirst('button.load-more-btn, .load-more') !== null;
      while (hasMore) {
        const data = (
          await http.get<{ html: string; has_more: boolean }>(
            `${BASE_URL}/load-more-chapters?slug=${encodeURIComponent(slug)}&offset=${offset}&sortByPosition=desc`,
            { headers, responseType: 'json' },
          )
        ).body;
        const more = data.html?.trim() ? parseChapters(html.load(data.html, { baseUrl: BASE_URL })) : [];
        chapters.push(...more);
        offset += more.length;
        hasMore = data.has_more && more.length > 0;
      }
      const seen = new Set<string>();
      return chapters.filter((c) => !seen.has(c.url) && seen.add(c.url));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('img.manga-image')
        .map((element) => element.absUrl('src') || element.absUrl('data-src') || '')
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) && !isNovel(`/truyen/${match[2]}`)
        ? { url: `/truyen/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
