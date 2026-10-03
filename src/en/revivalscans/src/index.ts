import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, findRscObject, hostOf } from './common/utils';

const BASE_URL = 'https://www.revivalscans.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SHOW_PREMIUM: Preference = {
  type: 'switch',
  key: 'pref_show_premium',
  label: 'Show premium chapters',
  description: 'Chapters that need a paid subscription; they cannot be read here without one.',
  default: false,
};

interface Series {
  id: string;
  title: string;
  coverImage?: string | null;
  status?: string | null;
}

interface Manhwa extends Series {
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  genres?: string[] | null;
  chapters?:
    | {
        id: string;
        number: number;
        title?: string | null;
        releaseDate?: string | null;
        accessRoles?: string[] | null;
      }[]
    | null;
}

const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus' };

// The Next.js pages answer React Server Component payloads (header "RSC: 1").
async function rsc<T>(path: string, key: string): Promise<T> {
  const body = (await http.get(`${BASE_URL}${path}`, { headers: { ...headers, RSC: '1' } })).body;
  const found = findRscObject<Record<string, T>>(
    body,
    (value) => key in value && value[key] != null && typeof value[key] === 'object',
  );
  if (!found) throw new Error(`Failed to extract ${key}`);
  return found[key]!;
}

async function catalogue(query = ''): Promise<MangaPage> {
  const q = query.trim().toLowerCase();
  const series = await rsc<Series[]>('/series', 'series');
  return {
    items: series
      .filter((s) => !q || s.title.toLowerCase().includes(q))
      .map((s) => ({
        url: `/series/${s.id}`,
        title: s.title,
        thumbnailUrl: s.coverImage ? `${BASE_URL}${s.coverImage}` : undefined,
      })),
    hasNextPage: false,
  };
}

export default defineExtension({
  preferences: () => [SHOW_PREMIUM],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => catalogue(),
    search: (query) => catalogue(query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await rsc<Manhwa>(manga.url, 'manhwa');
      return {
        url: manga.url,
        title: m.title,
        thumbnailUrl: m.coverImage ? `${BASE_URL}${m.coverImage}` : manga.thumbnailUrl,
        description: m.description || undefined,
        author: m.author || undefined,
        artist: m.artist || undefined,
        genres: m.genres ?? undefined,
        status: statuses[m.status?.toLowerCase() ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const m = await rsc<Manhwa>(manga.url, 'manhwa');
      const showPremium = prefs.get<boolean>(SHOW_PREMIUM.key) === true;
      return (m.chapters ?? [])
        .map((c) => ({ ...c, premium: c.accessRoles != null && !c.accessRoles.includes('reader') }))
        .filter((c) => showPremium || !c.premium)
        .map((c) => {
          const name = c.title || `Chapter ${String(c.number).replace(/\.0$/, '')}`;
          const time = c.releaseDate ? Date.parse(c.releaseDate) : Number.NaN;
          return {
            url: `/read/${m.id}/${c.id}`,
            name: c.premium ? `🔒 ${name}` : name,
            number: c.number,
            uploadedAt: Number.isFinite(time) ? time : undefined,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const pages = await rsc<{ url: string }[]>(chapter.url, 'pages');
      return pages.map((p, index) => ({ index, imageUrl: p.url.startsWith('http') ? p.url : `${BASE_URL}${p.url}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
