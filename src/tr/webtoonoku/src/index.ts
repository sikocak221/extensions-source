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
import { USER_AGENT, absoluteUrl, hostOf, ownText } from './common/utils';

const BASE_URL = 'https://webtoonoku.org';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const ORDERS = [
  { label: 'Popüler', value: 'popular' },
  { label: 'En Yeniler', value: 'latest' },
  { label: 'Puan', value: 'rating' },
  { label: 'A-Z', value: 'title' },
  { label: 'Z-A', value: 'title-desc' },
];

// Checkbox groups; `param` is the query parameter each ticked option is sent in.
const GROUPS: { id: string; label: string; param: string; options: [string, string][] }[] = [
  {
    id: 'status',
    label: 'Durum',
    param: 'status[]',
    options: [
      ['Devam Ediyor', 'Ongoing'],
      ['Tamamlandı', 'Completed'],
      ['Ara Verildi', 'Hiatus'],
      ['Bırakıldı', 'Dropped'],
    ],
  },
  {
    id: 'type',
    label: 'Tip',
    param: 'type[]',
    options: [
      ['Manga', 'Manga'],
      ['Manhwa', 'Manhwa'],
      ['Manhua', 'Manhua'],
    ],
  },
  {
    id: 'genre',
    label: 'Türler',
    param: 'genre[]',
    options: [
      ['Adaptasyon', 'adaptasyon'],
      ['Aksiyon', 'aksiyon'],
      ['Aşçılık', 'ascilik'],
      ['Bilim Kurgu', 'bilim-kurgu'],
      ['Doğaüstü', 'dogaustu'],
      ['Dövüş Sanatları', 'dovus-sanatlari'],
      ['Dram', 'dram'],
      ['Drama', 'drama'],
      ['Fantastik', 'fantastik'],
      ['Gerilim', 'gerilim'],
      ['Gizem', 'gizem'],
      ['Hayatta Kalma', 'hayatta-kalma'],
      ['Isekai', 'isekai'],
      ['Josei', 'josei'],
      ['Kesitler', 'kesitler'],
      ['Kıyamet', 'kiyamet'],
      ['Komedi', 'komedi'],
      ['Korku', 'korku'],
      ['Macera', 'macera'],
      ['Manga', 'manga'],
      ['Manhua', 'manhua'],
      ['Manhwa', 'manhwa'],
      ['Mecha', 'mecha'],
      ['Medikal', 'medikal'],
      ['Okul', 'okul'],
      ['Okul Hayatı', 'okul-hayati'],
      ['Oyun', 'oyun'],
      ['Psikolojik', 'psikolojik'],
      ['Reenkarnasyon', 'reenkarnasyon'],
      ['Reenkarne', 'reenkarne'],
      ['Romantik', 'romantik'],
      ['Romantizm', 'romantizm'],
      ['Seinen', 'seinen'],
      ['Shoujo', 'shoujo'],
      ['Shounen', 'shounen'],
      ['Sistem', 'sistem'],
      ['Slice of Life', 'slice-of-life'],
      ['Spor', 'spor'],
      ['Tarihi', 'tarihi'],
      ['Trajedi', 'trajedi'],
      ['Webtoon', 'webtoon'],
      ['Yapay Zeka Çeviri', 'yapay-zeka-ceviri'],
    ],
  },
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(page: number, order: string, extra: string[] = []): Promise<MangaPage> {
  const params = [`order=${order}`, ...extra];
  const document = await load(`/manhwa/${page > 1 ? `page/${page}/` : ''}?${params.join('&')}`);
  const items = document.select('article.manga-item').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('.manga-title a');
    const slug = (link?.absUrl('href') || link?.attr('href') || '').replace(/\/+$/, '').split('/').pop();
    if (!link || !slug) return [];
    return [
      {
        url: `/manhwa/${slug}/`,
        title: link.text(),
        thumbnailUrl: element.selectFirst('.manga-thumb img')?.absUrl('data-src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a.next.page-numbers') !== null };
}

// The site prints "-" for unknown author/artist.
function infoValue(document: HtmlElement, label: string): string | undefined {
  for (const item of document.select('.info-item')) {
    if (!item.select('.info-label').some((l) => ownText(l).includes(label))) continue;
    const value = item.selectFirst('.info-value')?.text();
    return value && value !== '-' ? value : undefined;
  }
  return undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, 'popular'),
    getLatest: (page) => list(page, 'latest'),
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filtreler yalnızca arama metni boşken uygulanır' },
      { type: 'select', id: 'order', label: 'Sıralama', options: ORDERS },
      ...GROUPS.map((group): Filter => ({
        type: 'group',
        id: group.id,
        label: group.label,
        filters: group.options.map(([label, value]): Filter => ({
          type: 'checkbox',
          id: `${group.id}.${value}`,
          label,
        })),
      })),
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return list(page, 'latest', [`s=${encodeURIComponent(query.trim())}`]);
      const extra = GROUPS.flatMap((group) =>
        group.options
          .filter(([, value]) => filters[`${group.id}.${value}`] === true)
          .map(([, value]) => `${encodeURIComponent(group.param)}=${encodeURIComponent(value)}`),
      );
      return list(page, typeof filters.order === 'string' && filters.order ? filters.order : 'popular', extra);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const statuses: Record<string, MangaStatus> = {
        'devam ediyor': 'ongoing',
        tamamlandı: 'completed',
        'ara verildi': 'hiatus',
        bırakıldı: 'cancelled',
      };
      return {
        url: manga.url,
        title: document.selectFirst('h1.manga-title-main')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('.manga-cover-img')?.absUrl('data-src') || manga.thumbnailUrl,
        author: infoValue(document, 'Yazar'),
        artist: infoValue(document, 'Sanatçı'),
        genres: document.select('.manga-genres a').map((a) => a.text()),
        description: document.selectFirst('.synopsis-content')?.text().trim() || undefined,
        status: statuses[infoValue(document, 'Durum')?.toLowerCase() ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      await timers.sleep(0);
      const seen = new Set<string>();
      const chapters: Chapter[] = [];
      const elements = document.select('a.chapter-box');
      for (let i = 0; i < elements.length; i++) {
        if (i % 40 === 0) await timers.sleep(0);
        const element = elements[i]!;
        const slug = (element.attr('href') ?? '').replace(/\/+$/, '').split('/').pop();
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        const number = Number.parseFloat(element.attr('data-chapter') ?? '');
        chapters.push({
          url: `/${slug}/`,
          name: ownText(element.selectFirst('.chapter-num')),
          number: Number.isNaN(number) ? undefined : number,
          uploadedAt: Date.parse(element.selectFirst('.chapter-date')?.attr('data-time-iso') ?? '') || undefined,
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('#readerImages img[data-src]')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.attr('data-src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:manhwa\/([^/?#]+)|([^/?#]+)-chapter-\d+[^/?#]*)\/?/i.exec(url.trim());
      if (!match || match[1]!.toLowerCase() !== hostOf(BASE_URL)) return null;
      const slug = match[2] ?? match[3];
      return slug ? { url: `/manhwa/${slug}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
