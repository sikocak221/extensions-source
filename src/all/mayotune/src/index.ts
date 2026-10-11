import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://mayochuu.xyz';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const NAMES: Record<string, string> = {
  en: 'Tune In to the Midnight Heart',
  ja: '真夜中ハートチューン',
  all: 'Mayonaka Heart Tune',
};
const AUTHOR = 'Masakuni Igarashi';

interface ChapterDto {
  id: string;
  title: string;
  number: number;
  pageCount: number;
  date: string;
}

const numberStr = (n: number) => (n % 1 === 0 ? String(Math.trunc(n)) : String(n));

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const endpoint = info.lang === 'ja' ? 'raw' : '';
    const apiBase = `${BASE_URL}/api/${endpoint ? `${endpoint}/` : ''}`;
    const source: MangaSummary = {
      url: '/',
      title: NAMES[info.lang] ?? NAMES.all!,
      thumbnailUrl: `${BASE_URL}/img/cover.jpg`,
    };

    return {
      baseUrl: BASE_URL,

      getPopular: async (): Promise<MangaPage> => ({ items: [source], hasNextPage: false }),

      getLatest: async (): Promise<MangaPage> => ({ items: [source], hasNextPage: false }),

      async search(query: string): Promise<MangaPage> {
        const q = query.toLowerCase();
        const match = Object.values(NAMES).some((n) => n.toLowerCase().includes(q)) || AUTHOR.toLowerCase().includes(q);
        return { items: match ? [source] : [], hasNextPage: false };
      },

      async getMangaDetails(): Promise<MangaDetails> {
        const response = await http.get(BASE_URL + source.url, { headers });
        const document = html.load(response.body, { baseUrl: response.url });
        const statusText = document.selectFirst('div.text-center:contains(Status)')?.text().split('Status')[0]?.trim();
        const statuses: Record<string, MangaStatus> = {
          Ongoing: 'ongoing',
          Completed: 'completed',
          Cancelled: 'cancelled',
          Hiatus: 'hiatus',
          Finished: 'completed',
        };
        return {
          url: source.url,
          title: source.title,
          author: AUTHOR,
          artist: undefined,
          description: document.selectFirst('.text-lg')?.text(),
          genres: document
            .selectFirst('span.text-sm:nth-child(2)')
            ?.text()
            .split('•')
            .map((g) => g.trim())
            .filter(Boolean),
          status: (statusText && statuses[statusText]) || 'unknown',
          thumbnailUrl: document.selectFirst('img.object-contain')?.absUrl('src') || source.thumbnailUrl,
        };
      },

      async getChapters(): Promise<Chapter[]> {
        const response = await http.get<ChapterDto[]>(`${apiBase}chapters`, { headers, responseType: 'json' });
        return [...response.body]
          .sort((a, b) => b.number - a.number)
          .map((c) => ({
            url: `/api/${endpoint ? `${endpoint}/` : ''}chapters?id=${c.id}&number=${numberStr(c.number)}`,
            name: c.title.trim() ? `Chapter ${numberStr(c.number)}: ${c.title}` : `Chapter ${numberStr(c.number)}`,
            number: c.number,
            uploadedAt: Date.parse(c.date) || undefined,
          }));
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const response = await http.get<ChapterDto>(BASE_URL + chapter.url, { headers, responseType: 'json' });
        return Array.from({ length: response.body.pageCount }, (_, index) => ({
          index,
          imageUrl: `${BASE_URL}/api/manga/${response.body.id}/${index + 1}`,
        }));
      },

      imageHeaders: () => headers,

      resolveUrl: (url: string): MangaSummary | null =>
        /^https?:\/\/(?:www\.)?mayochuu\.xyz/i.test(url.trim()) ? source : null,

      getWebUrl(item: MangaSummary | Chapter): string {
        if ('title' in item) return BASE_URL;
        const id = /[?&]id=([^&]+)/.exec(item.url)?.[1];
        return `${BASE_URL}/${endpoint}/chapter/${id}`;
      },
    };
  },
});
