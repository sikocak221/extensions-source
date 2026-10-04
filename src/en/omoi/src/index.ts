import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://www.omoi.com';
const API_URL = 'https://production.api.azuki.co';
const ORGANIZATION_KEY = '199e5a19-a236-49f5-81f4-43d4a541748a';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const apiHeaders = { ...headers, 'azuki-organization-key': ORGANIZATION_KEY };

const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_locked',
  label: 'Hide locked chapters',
  default: false,
};

const SORTS: [string, string][] = [
  ['Popular', 'popular'],
  ['Recent Series', 'recent_series'],
  ['Alphabetical', 'alphabetical'],
];

const ACCESS_TYPES: [string, string][] = [
  ['Any', ''],
  ['Partial Premium', 'premium_including_partial'],
  ['Premium', 'fully_premium'],
  ['Ebook', 'purchasable'],
];

const PUBLISHERS: [string, string][] = [
  ['Any', ''],
  ['ABLAZE', 'ablaze'],
  ["C'moA Comics", 'cmoa-comics'],
  ['CLLENN', 'cllenn'],
  ['Coamix Inc.', 'coamix'],
  ['COMIC ROOM Co., Ltd.', 'comic-room-co-ltd'],
  ['COMPASS Inc.', 'compass-inc'],
  ['CORK', 'cork'],
  ['FUNGUILD (MangaPlaza)', 'funguild-mangaplaza'],
  ['Futabasha Publishers Ltd.', 'futabasha-publishers-ltd'],
  ['Futabasha Publishers LTD. (MangaPlaza)', 'futabasha-publishers-ltd-mangaplaza'],
  ['Glacier Bay Books', 'glacier-bay-books'],
  ['honcomi', 'honcomi'],
  ['J-Novel Club', 'j-novel-club'],
  ['KADOKAWA', 'kadokawa'],
  ['Kaiten Books', 'kaiten-books'],
  ["Kaoru Tada/M'z plan/Minato Pro", 'kaoru-tada-mz-plan-minato-pro'],
  ['Kodansha', 'kodansha'],
  ['Libre Inc.', 'libre-inc'],
  ['Manga Box Co., Ltd.', 'manga-box-co-ltd'],
  ['Manga Mavericks Books', 'manga-mavericks-books'],
  ['Manga Up!', 'manga-up'],
  ['Omoi', 'azuki'],
  ['One Peace Books', 'one-peace-books'],
  ['PICK UP PRESS', 'pick-up-press'],
  ['Red String Translations', 'red-string-translations'],
  ['RIDEON', 'rideon'],
  ['SHODENSHA Publishing CO., LTD.', 'shodensha-publishing-co-ltd'],
  ['SHUFU TO SEIKATSU SHA', 'shufu-to-seikatsu-sha'],
  ['SOZO Comics', 'sozo-comics'],
  ['Star Fruit Books', 'star-fruit-books'],
  ['TAIYOHTOSHO Co., Ltd.', 'taiyohtosho-co-ltd'],
  ['Toii Games (MediBang!)', 'toii-games-medibang'],
  ['TORICO (MediBang!)', 'torico-medibang'],
  ['Unknown', 'unknown'],
  ['VAST Visual', 'vast-visual'],
  ['Voltage Inc.', 'voltage'],
  ['YUZU Comics', 'yuzu-comics'],
];

const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Comedy', 'comedy'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Fantasy', 'fantasy'],
  ['Harem', 'harem'],
  ['Historical', 'historical'],
  ['Horror', 'horror'],
  ['Josei', 'josei'],
  ['Martial Arts', 'martial-arts'],
  ['Mature', 'mature'],
  ['Mecha', 'mecha'],
  ['Mystery', 'mystery'],
  ['Psychological', 'psychological'],
  ['Romance', 'romance'],
  ['School Life', 'school-life'],
  ['Sci-Fi', 'scifi'],
  ['Seinen', 'seinen'],
  ['Shojo', 'shoujo'],
  ['Shonen', 'shounen'],
  ['Slice of Life', 'slice-of-life'],
  ['Sports', 'sports'],
  ['Supernatural', 'supernatural'],
  ['Tragedy', 'tragedy'],
];

interface Image {
  webp: { url: string; width: number }[];
}

interface DetailsDto {
  slug: string;
  uuid: string;
  name: string;
  short_description?: string | null;
  is_complete?: boolean | null;
  image?: Image | null;
  tags?: string[] | null;
  creators?: { name: string }[] | null;
  credits?: string | null;
  release_schedule?: string | null;
  alt_titles?: { name: string }[] | null;
}

interface ChapterDto {
  uuid: string;
  title?: string | null;
  label: string;
  release_date?: string | null;
  free_published_date?: string | null;
  free_unpublished_date?: string | null;
  is_upcoming?: boolean | null;
}

/** The largest webp rendition, bumped to the 2400px size the CDN always has. */
const bestImage = (image: Image | null | undefined) => {
  const best = [...(image?.webp ?? [])].sort((a, b) => b.width - a.width)[0];
  return best?.url.replace(/\/\d+_/, '/2400_');
};

async function api<T>(path: string): Promise<T> {
  const response = await http.request<string>({ url: `${API_URL}${path}`, headers: apiHeaders });
  if (response.status === 401 || response.status === 403)
    throw new Error('Log in via WebView and purchase this chapter to read.');
  if (response.status === 404) throw new Error('This chapter is not available.');
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${path}`);
  return JSON.parse(response.body) as T;
}

async function list(params: string[]): Promise<MangaPage> {
  const response = await http.get(`${BASE_URL}/discover?${params.join('&')}`, { headers });
  const document = html.load(response.body, { baseUrl: response.url });
  const items = document.select('ol.o-series-card-list li').flatMap((li): MangaSummary[] => {
    const link = li.selectFirst('a.a-card-link');
    const slug = (link?.absUrl('href') ?? '').replace(/\/+$/, '').split('/').pop();
    if (!link || !slug) return [];
    return [
      { url: `/series/${slug}`, title: link.text(), thumbnailUrl: li.selectFirst('img')?.absUrl('src') || undefined },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a[rel=next]') != null };
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

const details = (manga: MangaSummary) => api<DetailsDto>(`/manga/slug/${slugOf(manga.url)}/v0`);

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(['sort=popular', `page=${page}`]),
    getLatest: (page) => list(['sort=recent_series', `page=${page}`]),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const params = [`page=${page}`];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      params.push(`sort=${value('sort') || 'popular'}`);
      if (value('access_type')) params.push(`access_type=${value('access_type')}`);
      if (value('publisher_slug')) params.push(`publisher_slug=${value('publisher_slug')}`);
      for (const [, slug] of GENRES) if (filters[`genre.${slug}`] === true) params.push(`tags[]=${slug}`);
      return list(params);
    },
    getFilters: (): Filter[] => {
      const select = (id: string, label: string, options: [string, string][]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: options[0]![1],
      });
      return [
        { type: 'header', label: 'Note: Search and active filters are applied together' },
        select('sort', 'Sort by', SORTS),
        select('access_type', 'Access Type', ACCESS_TYPES),
        select('publisher_slug', 'Publisher', PUBLISHERS),
        {
          type: 'group',
          id: 'genre',
          label: 'Genres',
          filters: GENRES.map(([label, slug]) => ({ type: 'checkbox', id: `genre.${slug}`, label })),
        },
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const d = await details(manga);
      const parts = [
        d.short_description ?? '',
        d.credits ?? '',
        d.alt_titles?.length ? `Alternative Titles:\n${d.alt_titles.map((t) => t.name).join('\n')}` : '',
        d.release_schedule ?? '',
      ];
      return {
        url: `/series/${d.slug}`,
        title: d.name,
        thumbnailUrl: bestImage(d.image) ?? manga.thumbnailUrl,
        author: d.creators?.map((c) => c.name).join(', ') || undefined,
        description: parts.filter((p) => p.trim()).join('\n\n') || undefined,
        genres: d.tags ?? [],
        status: d.is_complete ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const d = await details(manga);
      const { chapters } = await api<{ chapters: ChapterDto[] }>(
        `/mangas/${d.uuid}/chapters/v4?order=ascending&count=1000`,
      );
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) ?? false;
      const now = Date.now();
      return chapters
        .map((c) => {
          const freeFrom = c.free_published_date ? Date.parse(c.free_published_date) : NaN;
          const freeUntil = c.free_unpublished_date ? Date.parse(c.free_unpublished_date) : NaN;
          const locked = !(freeFrom <= now && (Number.isNaN(freeUntil) || freeUntil > now));
          return { c, locked };
        })
        .filter(({ locked }) => !hideLocked || !locked)
        .map(({ c, locked }) => {
          let name = `Chapter ${c.label}${c.title ? ` - ${c.title}` : ''}`;
          if (c.is_upcoming) name += ' - [Upcoming]';
          const date = c.release_date ? Date.parse(c.release_date) : NaN;
          return {
            url: `/series/${d.slug}/read/${c.uuid}`,
            name: locked ? `🔒 ${name}` : name,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const uuid = chapter.url.split('/').pop();
      const result = await api<{ data: { pages: { image: Image }[] } }>(`/chapters/${uuid}/pages/v1`);
      return result.data.pages.map((p, index) => ({ index, imageUrl: `${bestImage(p.image)}?drm=1` }));
    },
    imageHeaders: () => headers,
    // Pages are XORed with 174 (the site's DecryptedImage module).
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      if (!(page.imageUrl ?? '').includes('drm=1')) return {};
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ 174;
      return { bytes: out };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: `/series/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
