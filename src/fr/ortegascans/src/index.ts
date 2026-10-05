import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject } from './common/utils';

const BASE_URL = 'https://ortegascans.fr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, rsc: '1' };

const HIDE_PREMIUM_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_hide_premium',
  label: 'Masquer les chapitres premium',
  description: 'Masquer les chapitres verrouillés du site',
  default: true,
};

const STATUSES: [string, string][] = [
  ['En cours', 'en cours'],
  ['Terminé', 'terminé'],
  ['En pause', 'en pause'],
  ['Annulé', 'annulé'],
];

const TAGS = [
  'Action', 'Aventure', 'Comédie', 'Drame', 'Esclave', 'Fantaisie', 'Fétichisme', 'Hardcore', 'Harem', 'Humiliation',
  'Hypnose', 'Isekai', 'Mature', 'MILF', 'Partenaire', 'Pouvoir', 'Revanche', 'Romance', 'Seinen', 'Sport',
  'Surnaturel', 'Système', 'Tranche de Vie', 'Vie Scolaire',
]; // prettier-ignore

interface Series {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
}

interface MangaDto extends Series {
  description?: string | null;
  status?: string | null;
  author?: string | null;
  artist?: string | null;
  alternativeNames?: string | null;
  categories?: string[];
  chapters: { id: string; number: number; title?: string | null; isPremium?: boolean; createdAt: string }[];
}

const cover = (path: string) => `${BASE_URL}/${path.replace('storage/', 'api/')}`;

const toSummary = (s: Series): MangaSummary => ({
  url: `/serie/${s.slug}`,
  title: s.title,
  thumbnailUrl: cover(s.coverImage),
});

const slugOf = (url: string) => url.replace(/^\/serie\//, '').replace(/^\/+/, '');

const STATUS: Record<string, MangaStatus> = {
  'en cours': 'ongoing',
  ongoing: 'ongoing',
  terminé: 'completed',
  complete: 'completed',
  'en pause': 'hiatus',
  'on hold': 'hiatus',
  annulé: 'cancelled',
  canceled: 'cancelled',
};

async function list(query: string, page: number, filters: FilterState, defaultSort: string): Promise<MangaPage> {
  const text = (id: string, fallback: string) => {
    const value = typeof filters[id] === 'string' ? (filters[id] as string).trim() : '';
    const result = value || fallback;
    if (!/^-?\d+$/.test(result)) throw new Error('Le champ doit être un nombre entier');
    return result;
  };
  const checked = (prefix: string) =>
    Object.entries(filters)
      .filter(([id, v]) => id.startsWith(prefix) && v === true)
      .map(([id]) => id.slice(prefix.length))
      .join(',');
  const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : defaultSort;
  const params: [string, string][] = [
    ['limit', '18'],
    ['page', String(page)],
    ['search', query],
    ['tags', checked('tag.')],
    ['status', checked('status.')],
    ['sort', sort],
    ['minChapters', text('min_chapters', '0')],
    ['isOrtegaOnly', 'false'],
    ['unreadOnly', 'false'],
    ['maxChapters', text('max_chapters', '9999')],
  ];
  const url = `${BASE_URL}/api/series?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  const dto = JSON.parse((await http.get(url, { headers })).body) as { data: Series[]; hasMore: boolean };
  return { items: dto.data.map(toSummary), hasNextPage: dto.hasMore };
}

async function details(slug: string): Promise<MangaDto> {
  const body = (await http.get(`${BASE_URL}/serie/${slug}`, { headers: rscHeaders })).body;
  const dto = findRscObject<{ manga: MangaDto }>(
    body,
    (v) => typeof v.manga === 'object' && v.manga !== null && Array.isArray((v.manga as MangaDto).chapters),
  );
  if (!dto) throw new Error("Impossible d'extraire les détails du manga");
  return dto.manga;
}

export default defineExtension({
  preferences: () => [HIDE_PREMIUM_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list('', page, {}, 'popular'),
    getLatest: (page) => list('', page, {}, 'recent'),
    search: (query, page, filters) => list(query, page, filters, 'popular'),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Trier par',
        options: [
          { label: 'Popularité', value: 'popular' },
          { label: 'Ordre alphabétique', value: 'alpha' },
          { label: 'Plus récent', value: 'recent' },
        ],
        default: 'popular',
      },
      {
        type: 'group',
        id: 'status',
        label: 'Statut',
        filters: STATUSES.map(([label, value]) => ({ type: 'checkbox', id: `status.${value}`, label })),
      },
      {
        type: 'group',
        id: 'tag',
        label: 'Tags',
        filters: TAGS.map((tag) => ({ type: 'checkbox', id: `tag.${tag}`, label: tag })),
      },
      { type: 'text', id: 'min_chapters', label: 'Nombre minimum de chapitres', placeholder: '0' },
      { type: 'text', id: 'max_chapters', label: 'Nombre maximum de chapitres', placeholder: '9999' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await details(slugOf(manga.url));
      return {
        ...toSummary(m),
        description:
          [m.description, m.alternativeNames ? `Noms alternatifs : ${m.alternativeNames}` : undefined]
            .filter(Boolean)
            .join('\n\n') || undefined,
        author: m.author ?? undefined,
        artist: m.artist ?? undefined,
        genres: m.categories ?? [],
        status: STATUS[(m.status ?? '').toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const m = await details(slugOf(manga.url));
      const hidePremium = prefs.get<boolean>(HIDE_PREMIUM_PREFERENCE.key) ?? true;
      return m.chapters
        .filter((c) => !hidePremium || !c.isPremium)
        .map((c) => {
          const number = String(c.number).replace(/\.0$/, '');
          return {
            url: `/serie/${m.slug}/chapter/${number}`,
            name: `${c.isPremium ? '🔒 ' : ''}Chapitre ${number}${c.title ? ` - ${c.title}` : ''}`,
            number: c.number,
            uploadedAt: Date.parse(c.createdAt.replace(/^\$D/, '')) || undefined,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(`${BASE_URL}${chapter.url}`, { headers: rscHeaders })).body;
      // The props sit in rows whose text may span lines: the images are read from the text.
      const json = /"images":(\[\{"index"[^\]]*\}\])/.exec(body)?.[1];
      if (!json) throw new Error("Impossible d'extraire la liste des pages");
      const images = JSON.parse(json) as { index: number; url: string }[];
      return images
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((image, index) => ({
          index,
          imageUrl: image.url.startsWith('http') ? image.url : `${BASE_URL}${image.url}`,
        }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?ortegascans\.fr\/serie\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/serie/${slug}`, title: '' } : null;
    },
  }),
});
