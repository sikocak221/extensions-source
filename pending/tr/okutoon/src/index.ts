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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://okutoon.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Aksiyon', 'aksiyon'],
  ['Askeri', 'askeri'],
  ['Bilim Kurgu', 'bilim-kurgu'],
  ['Doğaüstü', 'dogaustu'],
  ['Dövüş Sanatları', 'dovus-sanatlari'],
  ['Dram', 'dram'],
  ['Fantezi', 'fantezi'],
  ['Gerilim', 'gerilim'],
  ['Gizem', 'gizem'],
  ['Günlük Hayat', 'gunluk-hayat'],
  ['Harem', 'harem'],
  ['Hayatta Kalma', 'hayatta-kalma'],
  ['Isekai', 'isekai'],
  ['Josei', 'josei'],
  ['Kıyamet', 'kiyamet'],
  ['Komedi', 'komedi'],
  ['Korku', 'korku'],
  ['Macera', 'macera'],
  ['Okul Hayatı', 'okul-hayati'],
  ['Oyun', 'oyun'],
  ['Psikolojik', 'psikolojik'],
  ['Reenkarnasyon', 'reenkarnasyon'],
  ['Romantizm', 'romantizm'],
  ['Shoujo', 'shoujo'],
  ['Shounen', 'shounen'],
  ['Sihir', 'sihir'],
  ['Suç', 'suc'],
  ['Süperkahraman', 'superkahraman'],
  ['Tarihi', 'tarihi'],
  ['Yaoi', 'yaoi'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(query: string): Promise<MangaPage> {
  const document = await load(`/tur?${query}`);
  const items = document.select('.series-grid .series-card').flatMap((card): MangaSummary[] => {
    const title = card.selectFirst('.series-card-title')?.text();
    if (!title) return [];
    return [
      {
        url: relativeUrl(card.absUrl('href') || card.attr('href') || ''),
        title,
        thumbnailUrl: card.selectFirst('.series-card-cover img')?.absUrl('src') || undefined,
      },
    ];
  });
  return {
    items,
    hasNextPage: document.select('nav.pagination a.pagination-btn').some((a) => a.text().includes('Sonraki')),
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`sira=popular&sayfa=${page}`),
    getLatest: (page) => list(`sira=updated&sayfa=${page}`),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sıralama',
        default: 'updated',
        options: [
          { label: 'En Yeni', value: 'newest' },
          { label: 'Son Güncellenenler', value: 'updated' },
          { label: 'En Popüler', value: 'popular' },
          { label: 'En Yüksek Puan', value: 'rating' },
          { label: 'A-Z', value: 'az' },
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Durum',
        options: [
          { label: 'Tümü', value: '' },
          { label: 'Devam Ediyor', value: 'ongoing' },
          { label: 'Tamamlandı', value: 'completed' },
          { label: 'Ara Verildi', value: 'hiatus' },
        ],
      },
      {
        type: 'group',
        id: 'genres',
        label: 'Türler',
        filters: GENRES.map(([label, value]): Filter => ({ type: 'checkbox', id: `genre.${value}`, label })),
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`sayfa=${page}`];
      if (query) params.push(`q=${encodeURIComponent(query)}`);
      params.push(`sira=${typeof filters.sort === 'string' && filters.sort ? filters.sort : 'updated'}`);
      if (typeof filters.status === 'string' && filters.status) params.push(`durum=${filters.status}`);
      for (const [id, value] of Object.entries(filters)) {
        if (id.startsWith('genre.') && value === true) params.push(`k[]=${encodeURIComponent(id.slice(6))}`);
      }
      return list(params.join('&'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const author = document.selectFirst('.series-detail-author')?.text();
      const statusText = document
        .selectFirst('.series-detail-meta .badge-completed, .series-detail-meta .badge-ongoing')
        ?.text()
        .trim();
      const status: MangaStatus =
        statusText === 'Devam Ediyor' ? 'ongoing' : statusText === 'Tamamlandı' ? 'completed' : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('.series-detail-title')?.text() || manga.title,
        author: author && author !== 'Bilinmiyor' ? author : undefined,
        description: document.selectFirst('[data-series-description-content]')?.text() || undefined,
        genres: document.select('.series-detail-genres .tag').map((t) => t.text()),
        status,
        thumbnailUrl: document.selectFirst('.series-detail-cover img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('a.chapter-item').map((item): Chapter => ({
        url: relativeUrl(item.absUrl('href') || item.attr('href') || ''),
        name: item.selectFirst('.chapter-title')?.text() || item.text(),
        uploadedAt: parseDate(item.selectFirst('.chapter-date')?.text(), 'd MMMM yyyy'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('#readerPages img.reader-page')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
