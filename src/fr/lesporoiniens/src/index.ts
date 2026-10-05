import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://lesporoiniens.org';
const SERIES_DATA_SELECTOR = '#series-data-placeholder';
const READER_DATA_SELECTOR = '#reader-data-placeholder';

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface ChapterData {
  title?: string | null;
  volume?: string | null;
  last_updated?: number | string | null;
  licencied?: boolean;
  groups?: Record<string, string> | null;
}

interface SeriesData {
  title: string;
  description?: string | null;
  artist?: string | null;
  author?: string | null;
  cover?: string | null;
  tags?: string[] | null;
  release_status?: string | null;
  alternative_titles?: string[] | null;
  chapters?: Record<string, ChapterData> | ChapterData[] | null;
}

/** The chapters are a map keyed by chapter number, or a plain array (numbered from 1). */
function chapterMap(chapters: SeriesData['chapters']): Record<string, ChapterData> {
  if (!chapters) return {};
  if (Array.isArray(chapters)) return Object.fromEntries(chapters.map((c, i) => [String(i + 1), c]));
  return chapters;
}

const ACCENTS: Record<string, string> = {};
for (const [plain, accented] of [
  ['a', 'àáâäã'],
  ['e', 'èéêë'],
  ['i', 'ìíîï'],
  ['o', 'òóôöõ'],
  ['u', 'ùúûü'],
  ['c', 'ç'],
  ['n', 'ñ'],
] as const) {
  for (const c of accented) ACCENTS[c] = plain;
}

function toSlug(input: string): string {
  return [...input.toLowerCase()]
    .map((c) => ACCENTS[c] ?? c)
    .join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s/g, '-');
}

const mangaUrl = (s: SeriesData) => `/${toSlug(s.title)}`;

const toSummary = (s: SeriesData): MangaSummary => ({
  url: mangaUrl(s),
  title: s.title,
  thumbnailUrl: s.cover || undefined,
});

const STATUS: Record<string, MangaStatus> = { 'En cours': 'ongoing', Finis: 'completed', Fini: 'completed' };

function toDetails(s: SeriesData): MangaDetails {
  const base = s.description?.toLowerCase().includes('pas de synopsis') ? undefined : (s.description ?? undefined);
  const alternatives = s.alternative_titles ?? [];
  const description = alternatives.length
    ? `${base?.trim() ? `${base}\n\n` : ''}Alternative Titles:\n${alternatives.map((t) => `• ${t}`).join('\n')}`
    : base;
  return {
    ...toSummary(s),
    author: s.author || undefined,
    artist: s.artist || undefined,
    description,
    genres: s.tags ?? [],
    status: STATUS[s.release_status ?? ''] ?? 'unknown',
  };
}

async function fetchCatalogue(): Promise<SeriesData[]> {
  const config = JSON.parse((await http.get(`${BASE_URL}/data/config.json`, { headers })).body) as {
    LOCAL_SERIES_FILES: string[];
  };
  const series = await Promise.all(
    config.LOCAL_SERIES_FILES.map(async (file): Promise<SeriesData | null> => {
      try {
        return JSON.parse((await http.get(`${BASE_URL}/data/series/${file}`, { headers })).body) as SeriesData;
      } catch {
        return null;
      }
    }),
  );
  return series.filter((s): s is SeriesData => s !== null);
}

async function seriesPage(url: string): Promise<{ series: SeriesData; document: ReturnType<typeof html.load> }> {
  const response = await http.get(`${BASE_URL}${url}`, { headers });
  const document = html.load(response.body, { baseUrl: response.url });
  const json = document.selectFirst(SERIES_DATA_SELECTOR)?.html();
  if (!json) throw new Error('Series data not found');
  return { series: JSON.parse(json) as SeriesData, document };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: (await fetchCatalogue()).map(toSummary), hasNextPage: false };
    },
    async search(query, page): Promise<MangaPage> {
      const needle = query.trim().toLowerCase();
      if (page > 1) return { items: [], hasNextPage: false };
      const has = (value?: string | null) => value?.toLowerCase().includes(needle) === true;
      const matches = (await fetchCatalogue()).filter(
        (s) => !needle || has(s.title) || has(s.author) || has(s.artist) || (s.alternative_titles ?? []).some(has),
      );
      return { items: matches.map(toSummary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return toDetails((await seriesPage(manga.url)).series);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { series } = await seriesPage(manga.url);
      const chapters = chapterMap(series.chapters);
      const entries = Object.entries(chapters);
      const multiple = entries.length > 1;
      return entries
        .filter(([, data]) => !data.licencied)
        .map(([number, data]): Chapter => {
          const title = data.title ?? '';
          const volume = data.volume ?? '';
          const name = multiple
            ? `${volume.trim() ? `Vol. ${volume} ` : ''}Ch. ${number}${title.trim() ? ` – ${title}` : ''}`
            : title.trim()
              ? `One Shot – ${title}`
              : 'One Shot';
          const parsed = Number.parseFloat(number);
          return {
            url: `${mangaUrl(series)}/${number}`,
            name,
            number: Number.isNaN(parsed) ? -1 : parsed,
            uploadedAt: Number(data.last_updated) ? Number(data.last_updated) * 1000 : undefined,
          };
        })
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const chapterNumber = chapter.url.replace(/\/+$/, '').split('/').pop() ?? '';
      const json = document.selectFirst(READER_DATA_SELECTOR)?.html();
      if (!json) throw new Error('Reader data not found');
      const reader = JSON.parse(json) as { series: { chapters?: SeriesData['chapters'] } };
      const data = chapterMap(reader.series.chapters)[chapterNumber];
      if (!data) throw new Error(`Chapter data not found for chapter ${chapterNumber}`);
      const chapterUrl = Object.values(data.groups ?? {})[0];
      if (!chapterUrl) throw new Error(`Chapter URL not found for chapter ${chapterNumber}`);
      let images: string[];
      if (chapterUrl.includes('imgchest')) {
        const id = chapterUrl.substring(chapterUrl.lastIndexOf('/') + 1);
        const pages = JSON.parse(
          (await http.get(`${BASE_URL}/api/imgchest-chapter-pages?id=${id}`, { headers })).body,
        ) as { link: string }[];
        images = pages.map((p) => p.link);
      } else {
        images = JSON.parse((await http.get(`${BASE_URL}${chapterUrl}`, { headers })).body) as string[];
      }
      return images.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/lesporoiniens\.org\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/${slug}`, title: '' } : null;
    },
  }),
});
