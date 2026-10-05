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
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject } from './common/utils';

const BASE_URL = 'https://rimuscan.fr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SHOW_PREMIUM_PREFERENCE: Preference = {
  type: 'switch',
  key: 'show_premium_chapters',
  label: 'Afficher les chapitres premium',
  description: 'Afficher les chapitres payants (identifiés par 🔒) dans la liste.',
  default: false,
};

interface NextChapter {
  number: number;
  title?: string;
  releaseDate?: string | null;
  type?: string;
  images?: { order: number; url: string }[];
}

const toAbsoluteUrl = (url: string) =>
  url.startsWith('http') ? url : url.startsWith('/') ? `${BASE_URL}${url}` : `${BASE_URL}/${url}`;

const get = async (url: string) => (await http.get(url, { headers })).body;

async function seriesList(query: string): Promise<MangaPage> {
  const dto = JSON.parse(await get(`${BASE_URL}/api/series?${query}`)) as {
    series?: { slug: string; title: string; cover_url: string }[];
    has_more?: boolean;
  };
  return {
    items: (dto.series ?? []).map((s) => ({
      url: `/manga/${s.slug}`,
      title: s.title,
      thumbnailUrl: toAbsoluteUrl(s.cover_url),
    })),
    hasNextPage: dto.has_more ?? false,
  };
}

/**
 * Every chapter object found in the page's Next.js flight data. The payload deduplicates chapters across
 * components (some are only string references into a smaller array), so objects are collected one by one.
 */
function collectChapters(body: string): NextChapter[] {
  const chapters: NextChapter[] = [];
  findRscObject<unknown>(body, (value) => {
    if (typeof value.number === 'number' && 'type' in value) chapters.push(value as unknown as NextChapter);
    return false;
  });
  return chapters;
}

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

function toStatus(label: string | undefined): MangaStatus {
  switch (label?.toLowerCase()) {
    case 'en cours':
    case 'ongoing':
      return 'ongoing';
    case 'terminé':
    case 'termine':
    case 'completed':
      return 'completed';
    case 'en pause':
    case 'hiatus':
    case 'on hiatus':
      return 'hiatus';
    case 'annulé':
    case 'annule':
    case 'abandonné':
    case 'abandonne':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

const TYPES: Record<string, string> = { webtoon: 'Manhwa', manhwa: 'Manhwa', manhua: 'Manhua', manga: 'Manga' };

function parseDetails(document: HtmlElement, url: string): MangaDetails {
  const ld = document
    .select('script[type=application/ld+json]')
    .map((s) => s.html())
    .find((text) => text.includes('"ComicSeries"'));
  if (!ld) throw new Error('Détails introuvables');
  const data = JSON.parse(ld) as {
    name?: string;
    description?: string;
    image?: string;
    alternateName?: string[];
    author?: { name?: string };
    illustrator?: { name?: string };
    genre?: string[];
  };
  // The first two badges before the title are the type and the status.
  const badges = document.select('div.space-y-2:has(> h1) > div span').map((s) => s.text().trim());
  const description = [
    data.description?.trim(),
    (data.alternateName ?? []).filter((a) => a.trim()).length
      ? `Titres alternatifs : ${(data.alternateName ?? []).filter((a) => a.trim()).join(', ')}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');
  const type = badges[0] ? (TYPES[badges[0].toLowerCase()] ?? badges[0]) : undefined;
  return {
    url,
    title: data.name ?? '',
    thumbnailUrl: data.image ? toAbsoluteUrl(data.image) : undefined,
    description: description || undefined,
    author: data.author?.name?.trim() || undefined,
    artist: data.illustrator?.name?.trim() || undefined,
    genres: [...(type ? [type] : []), ...(data.genre ?? [])],
    status: toStatus(badges[1]),
  };
}

async function fetchGenres(): Promise<string[]> {
  return (JSON.parse(await get(`${BASE_URL}/api/admin/genres`)) as { genres?: string[] }).genres ?? [];
}

function searchQuery(query: string, page: number, filters: FilterState): string {
  const params: [string, string][] = [];
  if (query.trim()) {
    params.push(['search', query]);
  } else {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const checked = (prefix: string) =>
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith(prefix) && v === true)
        .map(([id]) => id.slice(prefix.length))
        .join(',');
    if (text('sort') && text('sort') !== 'updated') params.push(['sort', text('sort')]);
    if (text('types')) params.push(['types', text('types')]);
    if (checked('status.')) params.push(['status', checked('status.')]);
    if (text('min_chapters')) params.push(['min_chapters', text('min_chapters')]);
    if (filters.premium === true) params.push(['premium', '1']);
    if (checked('genre.')) params.push(['genres', checked('genre.')]);
  }
  params.push(['page', String(page)]);
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

export default defineExtension({
  preferences: () => [SHOW_PREMIUM_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => seriesList(`sort=rating&page=${page}`),
    getLatest: (page) => seriesList(`page=${page}`),
    search: (query, page, filters) => seriesList(searchQuery(query, page, filters)),
    async getFilters(): Promise<Filter[]> {
      const genres = await fetchGenres().catch((): string[] => []);
      const select = (id: string, label: string, entries: [string, string][]): Filter => ({
        type: 'select',
        id,
        label,
        options: entries.map(([label, value]) => ({ label, value })),
        default: entries[0]![1],
      });
      const filters: Filter[] = [
        { type: 'header', label: 'Les filtres sont ignorés par la recherche texte' },
        select('sort', 'Trier par', [
          ['Dernière mise à jour', 'updated'],
          ['Note', 'rating'],
          ['Nombre de chapitres', 'chapters'],
        ]),
        select('types', 'Type', [
          ['Tous', ''],
          ['Manhwa', 'webtoon'],
          ['Manga', 'manga'],
        ]),
        {
          type: 'group',
          id: 'status',
          label: 'Statut',
          filters: [
            { type: 'checkbox', id: 'status.ongoing', label: 'En cours' },
            { type: 'checkbox', id: 'status.completed', label: 'Terminé' },
            { type: 'checkbox', id: 'status.hiatus', label: 'En pause' },
          ],
        },
        select('min_chapters', 'Minimum de chapitres', [
          ['Tous', ''],
          ...['10', '50', '100', '200', '300', '500'].map((n): [string, string] => [`${n}+`, n]),
        ]),
        { type: 'checkbox', id: 'premium', label: 'Premium uniquement' },
      ];
      if (genres.length) {
        filters.push({
          type: 'group',
          id: 'genre',
          label: 'Genres',
          filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g}`, label: g })),
        });
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get(`${BASE_URL}${manga.url}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      return parseDetails(document, `/manga/${slugOf(response.url)}`);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(`${BASE_URL}${manga.url}`, { headers });
      const slug = slugOf(response.url);
      const showPremium = prefs.get<boolean>(SHOW_PREMIUM_PREFERENCE.key) ?? false;
      const seen = new Set<number>();
      return collectChapters(response.body)
        .filter((c) => !seen.has(c.number) && seen.add(c.number))
        .filter((c) => showPremium || c.type?.toUpperCase() !== 'PREMIUM')
        .sort((a, b) => b.number - a.number)
        .map((c): Chapter => {
          const number = String(c.number).split('.0')[0]!;
          const title = (c.title ?? '').trim();
          const base = `Chapitre ${number}`;
          let name = base;
          if (title && title !== base) {
            name = /chapitre|chapter/i.test(title) ? title : `${base} : ${title}`;
          }
          if (c.type?.toUpperCase() === 'PREMIUM') name = `🔒 ${name}`;
          return {
            url: `/read/${slug}/${number}`,
            name,
            number: c.number,
            scanlator: 'Rimu Scans',
            uploadedAt: Date.parse(c.releaseDate ?? '') || undefined,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
      const number = Number.parseFloat(slugOf(response.url));
      if (Number.isNaN(number)) throw new Error('Numéro de chapitre absent de la requête');
      const chapters = collectChapters(response.body);
      const found =
        chapters.find((c) => c.number === number && (c.images ?? []).length > 0) ??
        chapters.find((c) => c.number === number);
      if (!found) throw new Error('Chapitre introuvable');
      if ((found.images ?? []).length === 0) {
        if (found.type?.toUpperCase() === 'PREMIUM') throw new Error('Ce chapitre est premium. Lisez-le sur le site.');
        throw new Error('Aucune image trouvée pour ce chapitre');
      }
      return found
        .images!.slice()
        .sort((a, b) => a.order - b.order)
        .map((image, index) => ({ index, imageUrl: toAbsoluteUrl(image.url) }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?rimuscan\.fr\/manga\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/manga/${slug}`, title: '' } : null;
    },
  }),
});
