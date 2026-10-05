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
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, relativeUrl } from './common/utils';
import { relativeDateVi } from './vidate';

const BASE_URL = 'https://sangchanhteam.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CARD = "main .uk-grid-small:has(> .uk-width-1-3):has(h2 a[href*='/truyen/'])";

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const imageOf = (img: HtmlElement | null | undefined) =>
  img
    ? img.absUrl('data-original-src') ||
      img.absUrl('data-src') ||
      img.absUrl('data-lazy-src') ||
      img.absUrl('src') ||
      undefined
    : undefined;

const select = (id: string, label: string, options: [string, string][], value = options[0]![1]): Filter => ({
  type: 'select',
  id,
  label,
  default: value,
  options: options.map(([l, v]) => ({ label: l, value: v })),
});

async function filtered(page: number, params: Record<string, string>, genres: string[] = []): Promise<MangaPage> {
  const query = (
    [
      ...Object.entries({ type: '', status: '', age_rating: '', ...params }).filter(([k]) => k !== 'sort'),
      ...genres.map((g) => ['genre[]', g] as [string, string]),
      ['team', ''],
      ['rating_min', '0'],
      ['rating_max', '6'],
      ['sort', params.sort ?? 'updated'],
    ] as [string, string][]
  )
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const { document } = await load(`/bo-loc-nang-cao/${page > 1 ? `page/${page}/` : ''}?${query}`);
  const seen = new Set<string>();
  const items = document.select(CARD).flatMap((card): MangaSummary[] => {
    const link = card.selectFirst("h2 a[href*='/truyen/'], h3 a[href*='/truyen/'], a.uk-link-toggle[href*='/truyen/']");
    if (!link) return [];
    const url = relativeUrl(link.absUrl('href') ?? '');
    if (seen.has(url)) return [];
    seen.add(url);
    return [{ url, title: link.text(), thumbnailUrl: imageOf(card.selectFirst('img')) }];
  });
  return {
    items,
    hasNextPage: document.selectFirst(".uk-pagination li:not(.uk-disabled) > a[aria-label='Trang sau']") !== null,
  };
}

function statusOf(text: string | undefined): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('đang tiến hành') || value.includes('đã theo kịp')) return 'ongoing';
  if (value.includes('trọn bộ') || value.includes('hoàn thành')) return 'completed';
  if (value.includes('kết thúc mùa') || value.includes('tạm ngưng')) return 'hiatus';
  if (value.includes('bị hủy')) return 'cancelled';
  return 'unknown';
}

function chapterLinks(document: HtmlElement): Chapter[] {
  return document.select("#chapter-list a.uk-link-toggle[href*='/chap-']").map((a) => {
    const href = a.absUrl('href') ?? '';
    const slug = href.replace(/\/$/, '').split('/').pop() ?? '';
    const heading = a.selectFirst('h3')?.text();
    const time = a.selectFirst('time');
    const datetime = time?.attr('datetime');
    const parsed = datetime ? Date.parse(datetime) : Number.NaN;
    return {
      url: relativeUrl(href),
      name: heading
        ? heading.split('–').pop()!.trim().replace('Chap', 'Chương')
        : slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      number: Number(/^chap-(\d+(?:\.\d+)?)$/.exec(slug)?.[1]) || undefined,
      uploadedAt: Number.isNaN(parsed) ? relativeDateVi(time?.text().replace(/^mới$/i, 'vừa xong')) : parsed,
    };
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => filtered(page, { sort: 'views' }),
    getLatest: (page) => filtered(page, { sort: 'updated' }),
    async getFilters(): Promise<Filter[]> {
      const { document } = await load('/bo-loc-nang-cao/');
      const genres = new Map<string, string>();
      for (const input of document.select('input.genre-checkbox[value]')) {
        const name = input.attr('data-genre-name');
        const slug = input.attr('value');
        if (name && slug && !genres.has(slug)) genres.set(slug, name);
      }
      return [
        select('type', 'Loại truyện', [
          ['Tất cả', ''],
          ['Truyện tranh', 'comic'],
          ['Tiểu thuyết', 'novel'],
          ['Oneshot', 'oneshot'],
        ]),
        select('status', 'Trạng thái', [
          ['Tất cả', ''],
          ['Đang tiến hành', 'ongoing'],
          ['Kết thúc mùa', 'season_end'],
          ['Trọn bộ', 'completed'],
          ['Nguồn tạm ngưng', 'source_hiatus'],
          ['Đã theo kịp', 'caught_up'],
          ['Bị hủy', 'dropped'],
        ]),
        select('age_rating', 'Độ tuổi', [
          ['Tất cả', ''],
          ['Mọi lứa tuổi', 'all'],
          ['13+', '13+'],
          ['16+', '16+'],
          ['18+', '18+'],
        ]),
        select('sort', 'Sắp xếp', [
          ['Mới cập nhật', 'updated'],
          ['Mới nhất', 'new'],
          ['Cũ nhất', 'old'],
          ['Nhiều lượt xem nhất', 'views'],
          ['Lượt xem hôm nay', 'views_day'],
          ['Lượt xem tuần này', 'views_week'],
          ['Lượt xem tháng này', 'views_month'],
          ['Đánh giá cao nhất', 'rating'],
          ['Nhiều Thần Chú nhất', 'power'],
          ['Nhiều người theo dõi nhất', 'follow'],
        ]),
        ...(genres.size
          ? [
              {
                type: 'group' as const,
                id: 'genres',
                label: 'Thể loại',
                filters: [...genres].map(([slug, name]): Filter => ({
                  type: 'checkbox',
                  id: `genre.${slug}`,
                  label: name,
                })),
              },
            ]
          : []),
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        if (page > 1) return { items: [], hasNextPage: false };
        const results = (
          await http.get<{ title: string; url: string; post_type?: string | null; thumb?: string | null }[]>(
            `${BASE_URL}/wp-json/initlise/v1/search?term=${encodeURIComponent(query.trim())}`,
            { headers, responseType: 'json' },
          )
        ).body;
        const seen = new Set<string>();
        const items = results
          .filter((r) => r.url && (!r.post_type || r.post_type === 'manga'))
          .map((r) => ({
            url: relativeUrl(r.url),
            title: decodeEntities(r.title.replace(/<[^>]+>/g, '')),
            thumbnailUrl: r.thumb || undefined,
          }))
          .filter((m) => !seen.has(m.url) && Boolean(seen.add(m.url)));
        return { items, hasNextPage: false };
      }
      const params: Record<string, string> = {};
      for (const id of ['type', 'status', 'age_rating', 'sort']) {
        if (typeof filters[id] === 'string') params[id] = filters[id] as string;
      }
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice(6));
      return filtered(page, params, genres);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      return {
        url: manga.url,
        title: document.selectFirst('main h1')?.text() || manga.title,
        thumbnailUrl:
          imageOf(document.selectFirst("img[alt^='Ảnh bìa của']")) ??
          document.selectFirst('meta[property="og:image"]')?.attr('content') ??
          manga.thumbnailUrl,
        genres: document.select(".manga-block a[href*='/the-loai/']").map((a) => a.text()),
        status: statusOf(document.selectFirst('#manga-status')?.text()),
        description: document.selectFirst('#manga-description')?.text().trim() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document, url } = await load(manga.url);
      const lastPage = Math.max(
        1,
        ...document
          .select(".uk-pagination a[href*='/chap/page/']")
          .map((a) => Number(/\/page\/(\d+)/.exec(a.attr('href') ?? '')?.[1]) || 1),
      );
      const chapters = chapterLinks(document);
      const base = url.replace(/[?#].*$/, '').replace(/\/?$/, '/');
      for (let page = 2; page <= lastPage; page++) {
        chapters.push(...chapterLinks((await load(`${base}chap/page/${page}/`)).document));
      }
      return [...new Map(chapters.map((c) => [c.url, c])).values()];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      let images = document.select('#chapter-content img[data-imc-order]');
      if (!images.length) images = document.select('img[src*="/init-manga/"]');
      const urls = images
        .map((img) => img.absUrl('data-original-src') || img.absUrl('src') || '')
        .filter((u) => u && !u.startsWith('data:'));
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/truyen/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
