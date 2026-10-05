import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://inmanga.com';
const IMAGE_CDN = 'https://cdn1.intomanga.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const mangaForm = (page: number, sortBy: number, query = ''): Record<string, string> => ({
  'filter[generes][]': '-1',
  'filter[queryString]': query,
  'filter[skip]': String((page - 1) * 10),
  'filter[take]': '10',
  'filter[sortby]': String(sortBy),
  'filter[broadcastStatus]': '0',
  'filter[onlyFavorites]': 'false',
  d: '',
});

async function list(page: number, sortBy: number, query = ''): Promise<MangaPage> {
  const response = await http.post(
    `${BASE_URL}/manga/getMangasConsultResult`,
    { form: mangaForm(page, sortBy, query) },
    { headers },
  );
  const elements = html.load(response.body, { baseUrl: BASE_URL }).select('body > a');
  const items = elements.flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('h4.m0')?.text();
    if (!title) return [];
    return [
      {
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        title,
        thumbnailUrl: element.selectFirst('img')?.absUrl('data-src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: elements.length === 10 };
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseStatus(status: string | undefined): MangaStatus {
  if (status?.includes('En emisión')) return 'ongoing';
  if (status?.includes('Finalizado')) return 'completed';
  return 'unknown';
}

const mangaIdOf = (url: string) => url.substring(url.lastIndexOf('/') + 1);

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, 1),
    getLatest: (page) => list(page, 3),
    search: (query, page) => list(page, 1, query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      const info = document.selectFirst('div.col-md-3 div.panel.widget');
      const main = document.selectFirst('div.col-md-9');
      return {
        url: manga.url,
        title: main?.selectFirst('h1')?.text() ?? manga.title,
        thumbnailUrl: info?.selectFirst('img')?.absUrl('src') || manga.thumbnailUrl,
        status: parseStatus(
          info ? selectIgnoreCase(info, 'a.list-group-item:contains(estado) span')[0]?.text() : undefined,
        ),
        description: main?.selectFirst('div.panel-body')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(`${BASE_URL}/chapter/getall?mangaIdentification=${mangaIdOf(manga.url)}`, {
        headers,
      });
      const data = (JSON.parse(response.body) as { data?: string | null }).data;
      if (!data) return [];
      const result = JSON.parse(data) as {
        success: boolean;
        result?: {
          Number?: number | null;
          RegistrationDate: string;
          Identification?: string;
          FriendlyChapterNumber?: string;
        }[];
      };
      if (!result.success) return [];
      return (result.result ?? [])
        .map((c): Chapter => ({
          url: `/chapter/chapterIndexControls?identification=${c.Identification}`,
          name: `Chapter ${c.FriendlyChapterNumber}`,
          number: c.Number ?? 0,
          uploadedAt: Date.parse(c.RegistrationDate) || undefined,
        }))
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      const chapterId = document.selectFirst('input#ChapterIdentification')?.attr('value');
      const mangaId = document.selectFirst('input#MangaIdentification')?.attr('value');
      return document.select('img.ImageContainer').map((img, index) => ({
        index,
        imageUrl: `${IMAGE_CDN}/i/m/${mangaId}/c/${chapterId}/o/${img.attr('id')}.jpg`,
      }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?inmanga\.com(\/ver\/manga\/[^/?#]+\/[^/?#]+)\/?$/i.exec(url);
      return match ? { url: match[1]!, title: '' } : null;
    },
  }),
});
