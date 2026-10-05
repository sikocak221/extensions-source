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
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://teletruyen.com';
const headers = { 'User-Agent': USER_AGENT };
const SUPPORTED_PATHS = ['danh-sach', 'tim-kiem-nang-cao', 'the-loai', 'random'];
const VIETNAM_OFFSET = 7 * 3_600_000;

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const imageOf = (image: HtmlElement | null | undefined) =>
  image?.absUrl('data-src') || image?.absUrl('src') || undefined;

async function parseList(url: string, page: number): Promise<MangaPage> {
  const { document } = await load(url);
  const items = document.select('.comic-item').flatMap((card): MangaSummary[] => {
    const link = selectFirstWithTitle(card);
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || ''),
        title: link.text(),
        thumbnailUrl: imageOf(card.selectFirst('img')),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst(`a[href*='page=${page + 1}']`) !== null };
}

function selectFirstWithTitle(card: HtmlElement): HtmlElement | null {
  return card.select('a[href]').find((a) => a.selectFirst('h3.comic-title') !== null) ?? null;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => parseList(`${BASE_URL}/danh-sach/xem-nhieu?page=${page}`, page),
    getLatest: (page) => parseList(`${BASE_URL}/danh-sach/truyen-moi-cap-nhat?page=${page}`, page),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : undefined;
      const url = query.trim()
        ? `${BASE_URL}/tim-kiem-nang-cao?keyword=${encodeURIComponent(query.trim())}&page=${page}`
        : genre
          ? `${BASE_URL}/the-loai/${genre}?page=${page}`
          : `${BASE_URL}/tim-kiem-nang-cao?page=${page}`;
      return parseList(url, page);
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const { document } = await load(BASE_URL);
        const seen = new Set<string>();
        const genres = document.select("a[href*='/the-loai/']").flatMap((link) => {
          const slug = (link.attr('href') ?? '').split('/the-loai/').pop()!.split('?')[0]!;
          if (!slug || seen.has(slug)) return [];
          seen.add(slug);
          return [{ label: link.text(), value: slug }];
        });
        return genres.length
          ? [{ type: 'select', id: 'genre', label: 'Thể loại', options: genres, default: genres[0]!.value }]
          : [];
      } catch (error) {
        log.warn('Cannot load genres', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      const statusText =
        selectIgnoreCase(document, '.comic-intro-text strong:contains(Tình trạng) + span')[0]?.text() ?? '';
      const status: MangaStatus = statusText.includes('Đang tiến hành')
        ? 'ongoing'
        : statusText.includes('Đã hoàn thành')
          ? 'completed'
          : 'unknown';
      const seen = new Set<string>();
      const description = document.selectFirst('div.hide-long-text');
      return {
        url: manga.url,
        title: document.selectFirst('h2.info-title')?.text() || manga.title,
        author: document.selectFirst("a[href*='/tac-gia/']")?.text() || undefined,
        status,
        genres: document
          .select(".comic-info a[href*='/the-loai/']")
          .filter((a) => !seen.has(a.attr('href') ?? '') && seen.add(a.attr('href') ?? ''))
          .map((a) => a.text()),
        thumbnailUrl: imageOf(document.selectFirst('.col-sm-4 > img')) ?? manga.thumbnailUrl,
        // The text without the "show more" shadow element.
        description:
          description
            ?.html()
            .replace(/<[^>]*hide-long-text-shadow[^>]*>[\s\S]*?<\/[a-z]+>/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      return document.select('table tr').flatMap((row): Chapter[] => {
        const link = row.selectFirst("a[href*='/chuong-']");
        const name = /Chap\s+(\d+(?:\.\d+)?)/i.exec(link?.text() ?? '')?.[0];
        if (!link || !name) return [];
        const date = parseDate(row.selectFirst('td.hidden-xs.hidden-sm')?.text(), 'dd/MM/yyyy');
        return [
          {
            url: relativeUrl(link.absUrl('href') || ''),
            name,
            number: Number.parseFloat(name.replace(/^Chap\s+/i, '')),
            uploadedAt: date === undefined ? undefined : date - VIETNAM_OFFSET,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('#view-chapter img[data-src]')
        .map((image) => image.absUrl('data-src'))
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?teletruyen\.com\/([^/?#]+)/i.exec(url.trim());
      return match && !SUPPORTED_PATHS.includes(match[1]!) ? { url: `/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
