import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

// The site is a static app over a JSON API on the same origin (no login needed for free chapters).
const BASE_URL = 'https://insanoslibrary.com';
const SHOW_PAID_PREF = 'show_paid_chapters';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json' };

interface Series {
  id: number;
  title: string;
  description?: string | null;
  cover_image?: string | null;
  genre?: string[] | null;
  series_type?: string | null;
  alt_title?: string | null;
  author?: string | null;
  status?: string | null;
  view_count?: number;
  updated_at?: string;
}

interface ApiChapter {
  id: number;
  chapter_number: number;
  title?: string | null;
  volume?: number | null;
  is_published: boolean;
  is_unlocked: boolean;
  published_at?: string | null;
  created_at?: string | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${BASE_URL}${path}`, { headers, responseType: 'json' })).body;
}

const seriesId = (url: string) => /\/serie\/(\d+)/.exec(url)?.[1] ?? '';

function summary(series: Series): MangaSummary {
  return {
    url: `/serie/${series.id}`,
    title: series.title,
    thumbnailUrl: series.cover_image ? absoluteUrl(BASE_URL, series.cover_image) : undefined,
  };
}

/** The catalog is one unpaginated list. */
async function catalog(sort: (a: Series, b: Series) => number): Promise<MangaPage> {
  return { items: (await api<Series[]>('/series/')).sort(sort).map(summary), hasNextPage: false };
}

const time = (value: string | null | undefined) => {
  const parsed = value
    ? Date.parse(value.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
    : Number.NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
};

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: SHOW_PAID_PREF,
      label: 'Mostrar capítulos de pago',
      description: 'Incluye capítulos que requieren monedas para leer',
      default: false,
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => catalog((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)),
    getLatest: () => catalog((a, b) => (time(b.updated_at) ?? 0) - (time(a.updated_at) ?? 0)),
    async search(query: string): Promise<MangaPage> {
      const needle = query.trim().toLowerCase();
      const all = await api<Series[]>('/series/');
      return {
        items: all
          .filter((s) => !needle || `${s.title} ${s.alt_title ?? ''}`.toLowerCase().includes(needle))
          .map(summary),
        hasNextPage: false,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const series = await api<Series>(`/series/${seriesId(manga.url)}`);
      const statusText = series.status?.toLowerCase();
      const status: MangaStatus =
        statusText === 'en emisión' ? 'ongoing' : statusText === 'finalizado' ? 'completed' : 'unknown';
      return {
        ...summary(series),
        description: series.description || undefined,
        author: series.author || undefined,
        genres: [...(series.genre ?? []), ...(series.series_type ? [series.series_type] : [])],
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = seriesId(manga.url);
      const showPaid = prefs.get<boolean>(SHOW_PAID_PREF) === true;
      return (await api<ApiChapter[]>(`/series/${id}/chapters`))
        .filter((c) => c.is_published && (showPaid || c.is_unlocked))
        .sort((a, b) => b.chapter_number - a.chapter_number)
        .map((c) => ({
          url: `/series/${id}/chapters/${c.id}`,
          name: `Capítulo ${c.chapter_number}${c.title ? `: ${c.title}` : ''}${c.is_unlocked ? '' : ' 🔒'}`,
          number: c.chapter_number,
          uploadedAt: time(c.published_at ?? c.created_at),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await api<{ pages: string[] }>(`${chapter.url}/pages`);
      return data.pages.map((path, index) => ({ index, imageUrl: absoluteUrl(BASE_URL, path) }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:serie|series)\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/serie/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) =>
      absoluteUrl(BASE_URL, item.url.replace(/\/series\/(\d+)\/chapters\/(\d+)/, '/reader?series=$1&chapter=$2')),
  }),
});
