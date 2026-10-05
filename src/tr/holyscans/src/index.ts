import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl } from './common/utils';

const BASE_URL = 'https://holyscans.com.tr';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };

const GENRES: [string, string][] = [
  ['Aksiyon', 'aksiyon'],
  ['Doğaüstü', 'dogaustu'],
  ['Dövüş Sanatları', 'dovus-sanatlari'],
  ['Dram', 'dram'],
  ['Fantazi', 'fantazi'],
  ['Gender Bender', 'gender-bender'],
  ['Gizem', 'gizem'],
  ['Harem', 'harem'],
  ['İsekai', 'isekai'],
  ['Josei', 'josei'],
  ['Kız Aşkı', 'kiz-aski'],
  ['Komedi', 'komedi'],
  ['Macera', 'macera'],
  ['Okul', 'okul'],
  ['Romantizm', 'romantizm'],
  ['Seinen', 'seinen'],
  ['Shoujo', 'shoujo'],
  ['Shoujo Ai', 'shoujo-ai'],
  ['Shounen', 'shounen'],
  ['Slice Of Life', 'slice-of-life'],
  ['Spor', 'spor'],
  ['Tarihi', 'tarihi'],
  ['Yaoi', 'yaoi'],
  ['Yetişkin', 'yetiskin'],
];
const TYPES: [string, string][] = [
  ['Webtoon', 'manhwa'],
  ['Manga', 'manga'],
  ['Manhua', 'manhua'],
  ['Novel', 'novel'],
];
const STATUSES: [string, string][] = [
  ['Devam Ediyor', 'ongoing'],
  ['Tamamlandı', 'completed'],
];

// The page token is tied to the session cookie the chapter page sets.
const cookieHeader = (setCookie?: string): Record<string, string> => {
  const cookies = (setCookie ?? '')
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((c) => c.split(';')[0]!.trim())
    .filter(Boolean);
  return cookies.length ? { Cookie: cookies.join('; ') } : {};
};

const form = (pairs: [string, string][]) =>
  pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

async function ajax<T>(pairs: [string, string][], extra: Record<string, string> = {}): Promise<T> {
  const response = await http.post(AJAX_URL, form(pairs), { headers: { ...headers, ...FORM, ...extra } });
  return JSON.parse(response.body) as T;
}

function parseCards(content: string): MangaSummary[] {
  const document = html.load(content, { baseUrl: BASE_URL });
  return document.select('.manga-card-v2').flatMap((card): MangaSummary[] => {
    const titleLink = card.selectFirst('.mc-title a');
    let href: string | undefined;
    let title: string | undefined;
    if (titleLink) {
      href = titleLink.absUrl('href') || titleLink.attr('href');
      title = titleLink.text();
    } else {
      const box = card.selectFirst('.mc-image-box');
      href = box?.absUrl('data-href') || box?.attr('data-href');
      title = box?.selectFirst('img')?.attr('alt');
    }
    if (!href || !title) return [];
    return [
      {
        url: relativeUrl(href),
        title,
        thumbnailUrl: card.selectFirst('.mc-image-box img')?.absUrl('src') || undefined,
      },
    ];
  });
}

async function archive(page: number, extra: [string, string][] = []): Promise<MangaPage> {
  const result = await ajax<{ data?: { content?: string; pagination?: string } }>(
    [['action', 'filter_manga_archive'], ['paged', String(page)], ...extra],
    { Referer: `${BASE_URL}/manga/?m_orderby=views` },
  );
  return {
    items: parseCards(result.data?.content ?? ''),
    hasNextPage: result.data?.pagination?.includes('next page-numbers') ?? false,
  };
}

const checked = (filters: FilterState, prefix: string) =>
  Object.entries(filters)
    .filter(([id, value]) => id.startsWith(`${prefix}.`) && value === true)
    .map(([id]) => id.slice(prefix.length + 1));

function parseRelativeDate(text: string): number | undefined {
  const value = text.toLowerCase();
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const amount = Number.parseInt(value.split(' ')[0] ?? '', 10) || 0;
  if (['yeni', 'bugün', 'saat', 'dakika'].some((w) => value.includes(w))) return now.getTime();
  if (value.includes('dün')) return midnight.getTime() - 86_400_000;
  if (value.includes('gün')) return midnight.getTime() - amount * 86_400_000;
  if (value.includes('hafta')) return midnight.getTime() - amount * 7 * 86_400_000;
  if (value.includes('ay')) {
    midnight.setMonth(midnight.getMonth() - amount);
    return midnight.getTime();
  }
  if (value.includes('yıl')) {
    midnight.setFullYear(midnight.getFullYear() - amount);
    return midnight.getTime();
  }
  return undefined;
}

const group = (id: string, label: string, list: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: list.map(([name, value]): Filter => ({ type: 'checkbox', id: `${id}.${value}`, label: name })),
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => archive(page),
    getFilters: (): Filter[] => [
      group('genre', 'Türler', GENRES),
      group('type', 'Seri Tipi', TYPES),
      group('status', 'Durum', STATUSES),
    ],
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) {
        const result = await ajax<{ data?: string }>([
          ['action', 'holy_live_search'],
          ['keyword', query],
        ]);
        const document = html.load(result.data ?? '', { baseUrl: BASE_URL });
        const items = document.select('a.holy-live-result-item').flatMap((link): MangaSummary[] => {
          const href = link.absUrl('href') || link.attr('href');
          return href
            ? [
                {
                  url: relativeUrl(href),
                  title: link.selectFirst('span')?.text() ?? '',
                  thumbnailUrl: link.selectFirst('img')?.absUrl('src') || undefined,
                },
              ]
            : [];
        });
        return { items, hasNextPage: false };
      }
      return archive(page, [
        ...checked(filters, 'genre').map((v): [string, string] => ['genres[]', v]),
        ...checked(filters, 'type').map((v): [string, string] => ['types[]', v]),
        ...checked(filters, 'status').map((v): [string, string] => ['statuses[]', v]),
      ]);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const title = document.selectFirst('h1.hs-title')?.text();
      if (!title) throw new Error('Manga başlığı bulunamadı');
      const info = (label: string, selector: string) =>
        document.selectFirst(`.hs-info-row:contains(${label}) ${selector}`)?.text() || undefined;
      const statusText = info('Durum', '.hs-pill')?.toLowerCase();
      const status: MangaStatus =
        statusText === 'devam ediyor'
          ? 'ongoing'
          : statusText === 'tamamlandı' || statusText === 'final'
            ? 'completed'
            : 'unknown';
      return {
        url: manga.url,
        title,
        // The cover <img> is a locked placeholder for guests, og:image always has the real cover.
        thumbnailUrl: document.selectFirst('meta[property=og:image]')?.attr('content') || manga.thumbnailUrl,
        author: info('Yazar', '.val'),
        artist: info('Çizer', '.val'),
        genres: document.select('.hs-genres a').map((a) => a.text()),
        status,
        description: document.selectFirst('.hs-summary-content')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      return document.select('.manga-chapter-list-wrap .ch-list-item').flatMap((item): Chapter[] => {
        const name = ownText(item.selectFirst('.ch-title'));
        if (!name) return [];
        return [
          {
            url: relativeUrl(item.absUrl('href') || item.attr('href') || ''),
            name: item.attr('class')?.split(/\s+/).includes('ch-locked') ? `🔒 ${name}` : name,
            uploadedAt: parseRelativeDate(item.selectFirst('.ch-date')?.text() ?? ''),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const body = response.body;
      const grab = (pattern: RegExp, error: string) => {
        const value = pattern.exec(body)?.[1];
        if (!value) throw new Error(error);
        return value;
      };
      const chapterId = grab(/"chapter_id"\s*:\s*(\d+)/, 'Bu bölüm kilitli (VIP/coin), tarayıcıda açın');
      const loadTime = grab(/"load_time"\s*:\s*(\d+)/, 'load_time bulunamadı');
      const pageToken = grab(/"page_token"\s*:\s*"([^"]+)"/, 'page_token bulunamadı');
      const nonce = grab(/"nonce"\s*:\s*"([^"]+)"/, 'nonce bulunamadı');
      const result = await ajax<{ data?: { urls?: string[] } }>(
        [
          ['action', 'holy_get_chapter_images'],
          ['nonce', nonce],
          ['chapter_id', chapterId],
          ['load_time', loadTime],
          ['page_token', pageToken],
        ],
        {
          Referer: response.url,
          'X-Requested-With': 'XMLHttpRequest',
          Origin: BASE_URL,
          ...cookieHeader(response.headers['set-cookie']),
        },
      );
      return (result.data?.urls ?? []).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({
      ...headers,
      Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
    }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
