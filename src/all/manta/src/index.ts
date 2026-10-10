import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, withQuery } from './common/utils';

const API_URL = 'https://manta.net';
const BLACK_IMAGE_MARKER = 'just-black.jpg';

interface Name {
  en?: string | null;
  es?: string | null;
}
interface Image {
  downloadUrl: string;
}
interface Series {
  id: number;
  image?: Record<string, Image | null>;
  data: {
    title?: Name;
    tags?: { name: Name }[];
    isCompleted?: boolean | null;
    description?: { long: string; short?: string | null };
    creators?: { name: string; role: string }[];
  };
  episodes?: Episode[];
}
interface Episode {
  id: number;
  ord: number;
  data?: { title?: string | null } | null;
  lockData?: { state?: number | null } | null;
  openAt?: string | null;
  createdAt?: string | null;
  cutImages?: Image[] | null;
}

const asString = (name: Name | undefined, lang: string) =>
  lang === 'es' ? (name?.es ?? name?.en ?? '') : (name?.en ?? name?.es ?? '');
const isLocked = (e: Episode) => e.lockData?.state != null && ![110, 130].includes(e.lockData.state);
const timestamp = (text?: string | null) => {
  if (!text) return undefined;
  const time = Date.parse(`${text.split('.')[0]!.split('+')[0]!.replace(/Z$/, '')}Z`);
  return Number.isNaN(time) ? undefined : time;
};
const cover = (series: Series) => {
  const images = series.image ?? {};
  return (images['1280x1840_480'] ?? images['1280x1840_720'] ?? images['1440x3072'] ?? images['1440x1440_480'])
    ?.downloadUrl;
};

const CATEGORIES_EN: [string, string][] = [
  ['Unlimited', '359'], ['New', '288'], ['Exclusive', '289'], ['Completed', '287'], ['Event', '354'], ['Romantasy', '355'],
  ['Romance', '3'], ['Fantasy/Sci-Fi', '14'], ['Drama', '2'], ['Thriller', '231'], ['BL', '16'], ['GL', '17'],
  ['Nonfiction', '249'], ['Action & Adventure', '361'], ['Comedy', '13'], ['Historical', '7'], ['Horror', '1'],
  ['School life', '74'], ['Slice of life', '11'], ['Sports', '6'], ['Suspense & Thriller', '362'],
]; // prettier-ignore
const CATEGORIES_ES: [string, string][] = [
  ['Nueva', '288'], ['Exclusiva', '289'], ['Finalizada', '287'], ['Romantasía', '355'], ['Romance', '3'], ['BL', '16'],
  ['Comedia', '13'], ['Histórico', '7'], ['Vida cotidiana', '11'],
]; // prettier-ignore

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: 'show_locked_chapters',
      label: 'Show paid/locked chapters',
      description: 'Show paid or locked chapters in the chapter list',
      default: true,
    },
  ],

  createSource: (info: SourceInfo) => {
    const lang = info.lang;
    const baseUrl = `${API_URL}/${lang}`;
    const headers = { 'User-Agent': USER_AGENT, Origin: API_URL, Referer: `${baseUrl}/`, 'Accept-Language': lang };
    const getJson = async <T>(url: string): Promise<T> =>
      (await http.get<{ data: T }>(url, { headers, responseType: 'json' })).body.data;

    const searchSeries = async (params: Record<string, string>): Promise<MangaPage> => {
      const data = await getJson<Series[]>(withQuery(`${API_URL}/manta/v1/search/series`, { ...params, lang }));
      return {
        items: data.map((s) => ({
          url: `/series/${s.id}`,
          title: asString(s.data.title, lang),
          thumbnailUrl: cover(s),
        })),
        hasNextPage: false,
      };
    };

    return {
      baseUrl,

      getPopular: () => searchSeries({ cat: 'New' }),

      getFilters(): Filter[] {
        return [
          { type: 'header', label: 'Filters are ignored when searching' },
          { type: 'separator' },
          {
            type: 'select',
            id: 'category',
            label: lang === 'es' ? 'Categoría' : 'Category',
            options: (lang === 'es' ? CATEGORIES_ES : CATEGORIES_EN).map(([label, value]) => ({ label, value })),
          },
        ];
      },

      async search(query: string, _page: number, state: FilterState): Promise<MangaPage> {
        if (query) return searchSeries({ q: query });
        return searchSeries({ tagId: typeof state.category === 'string' && state.category ? state.category : '288' });
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const series = await getJson<Series>(`${API_URL}/front/v1/series/${manga.url.split('/').pop()}?lang=${lang}`);
        const creators = series.data.creators ?? [];
        const artists = creators.filter((c) => c.role === 'Illustration');
        const authors = creators.filter((c) => c.role !== 'Illustration');
        const description = series.data.description;
        return {
          url: manga.url,
          title: asString(series.data.title, lang) || manga.title,
          thumbnailUrl: cover(series) ?? manga.thumbnailUrl,
          description: description ? [description.short, description.long].filter(Boolean).join('\n\n') : undefined,
          genres: (series.data.tags ?? []).map((t) => asString(t.name, lang)),
          artist: artists.map((a) => a.name).join(', ') || undefined,
          author: (authors.length ? authors : creators).map((a) => a.name).join(', ') || undefined,
          status: series.data.isCompleted ? 'completed' : 'ongoing',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const series = await getJson<Series>(`${API_URL}/front/v1/series/${manga.url.split('/').pop()}?lang=${lang}`);
        const showLocked = prefs.get<boolean>('show_locked_chapters') !== false;
        return (series.episodes ?? [])
          .filter((e) => showLocked || !isLocked(e))
          .map((e): Chapter => ({
            url: String(e.id),
            name: `${e.data?.title ?? `${lang === 'es' ? 'Episodio' : 'Episode'} ${e.ord}`}${isLocked(e) ? ' 🔒' : ''}`,
            number: e.ord,
            uploadedAt: timestamp(e.openAt) ?? timestamp(e.createdAt),
          }))
          .reverse();
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const episode = await getJson<Episode>(`${API_URL}/front/v1/episodes/${chapter.url}?lang=${lang}`);
        const images = (episode.cutImages ?? []).map((i) => i.downloadUrl);
        // Locked chapters return real preview images followed by "just-black.jpg" placeholders.
        const preview = images.filter((u) => !u.includes(BLACK_IMAGE_MARKER));
        const pages: Page[] = preview.map((imageUrl, index) => ({ index, imageUrl }));
        if (preview.length < images.length) {
          const heading = lang === 'es' ? 'Fin de la vista previa del capítulo' : 'End of chapter preview';
          const sub =
            lang === 'es'
              ? 'Compra e inicia sesión en el sitio para leer completo'
              : 'Purchase and log in on the site to read the full chapter';
          pages.push({
            index: pages.length,
            imageUrl: withQuery('https://fakeimg.ryd.tools/1500x2126/f4f4f4/222222/', {
              text: `${heading}\n\n${sub}`,
              font_size: '58',
            }),
          });
        }
        return pages;
      },

      imageHeaders: () => headers,

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?manta\.net\/(?:[a-z]{2}\/)?series\/([^/?#]+)/i.exec(url.trim());
        return match ? { url: `/series/${match[1]}`, title: '' } : null;
      },

      getWebUrl: (item: MangaSummary | Chapter) =>
        'title' in item ? `${baseUrl}${item.url}` : `${baseUrl}/episodes/${item.url}`,
    };
  },
});
