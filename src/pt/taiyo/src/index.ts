import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://taiyo.moe';
const SEARCH_URL = 'https://meilisearch.taiyo.moe/multi-search';
const IMG_CDN = 'https://cdn.taiyo.moe/medias';
const TOKEN_KEY = 'TAIYO_BEARER_TOKEN';
const TOKEN_REGEX = /NEXT_PUBLIC_MEILISEARCH_PUBLIC_KEY:(\s+)?"([^"]+)/;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: Record<string, string> = {
  ACTION: 'Ação',
  ADVENTURE: 'Aventura',
  COMEDY: 'Comédia',
  DRAMA: 'Drama',
  ECCHI: 'Ecchi',
  FANTASY: 'Fantasia',
  HENTAI: 'Hentai',
  HORROR: 'Horror',
  MAHOU_SHOUJO: 'Mahou Shoujo',
  MECHA: 'Mecha',
  MUSIC: 'Música',
  MYSTERY: 'Mistério',
  PSYCHOLOGICAL: 'Psicológico',
  ROMANCE: 'Romance',
  SCI_FI: 'Sci-fi',
  SLICE_OF_LIFE: 'Slice of Life',
  SPORTS: 'Esportes',
  SUPERNATURAL: 'Sobrenatural',
  THRILLER: 'Thriller',
};
const LANGUAGES: Record<string, string> = {
  pt: 'português',
  en: 'inglês',
  ja: 'japonês',
  ko: 'coreano',
  zh: 'chinês',
  es: 'espanhol',
  fr: 'francês',
  it: 'italiano',
  de: 'alemão',
  ru: 'russo',
};

interface Title {
  title: string;
  language: string;
  priority: number;
}
interface MediaDto {
  id: string;
  synopsis?: string | null;
  status?: string | null;
  genres?: string[] | null;
  mainCoverId?: string | null;
  titles: Title[];
}

async function text(url: string): Promise<string> {
  return (await http.get(url, { headers })).body;
}

/** The public Meilisearch key is embedded in one of the site's scripts. */
async function fetchToken(): Promise<string> {
  const document = html.load(await text(BASE_URL), { baseUrl: BASE_URL });
  const scripts = document.select('script[src*=next]:not([nomodule]):not([src*=app])').reverse();
  for (const script of scripts) {
    const src = script.attr('src');
    if (!src) continue;
    const body = await text(src.startsWith('http') ? src : BASE_URL + src);
    const token = TOKEN_REGEX.exec(body)?.[2];
    if (token) {
      await storage.set(TOKEN_KEY, token);
      return token;
    }
  }
  throw new Error('Não foi possivel localizar o token');
}

async function search(page: number, query: string): Promise<MangaPage> {
  const limit = 21;
  const body = {
    queries: [{ indexUid: 'medias', q: query, filter: ['deletedAt IS NULL'], limit, offset: limit * (page - 1) }],
  };
  const send = (token: string) =>
    http.post<{ results: { hits: MediaDto[] }[] }>(
      SEARCH_URL,
      { json: body },
      {
        headers: { ...headers, Authorization: `Bearer ${token}` },
        responseType: 'json',
      },
    );
  let response = await send((await storage.get<string>(TOKEN_KEY)) || (await fetchToken()));
  if (response.status === 401 || response.status === 403) response = await send(await fetchToken());
  const hits = response.body.results?.[0]?.hits ?? [];
  const items = hits.map((item): MangaSummary => ({
    url: `/media/${item.id}`,
    title:
      item.titles.find((t) => t.language.includes('en'))?.title ??
      [...item.titles].sort((a, b) => b.priority - a.priority)[0]?.title ??
      '',
    thumbnailUrl: item.mainCoverId
      ? `${BASE_URL}/_next/image?url=${IMG_CDN}/${item.id}/covers/${item.mainCoverId}.jpg&w=256&q=75`
      : undefined,
  }));
  return { items, hasNextPage: items.length > 0 };
}

/** Json embedded (escaped) in the page's React payload, cut before `end`. */
function embedded<T>(body: string, name: string, end: string, close: string): T | undefined {
  const marker = `,{\\"${name}\\":`;
  const start = body.indexOf(marker);
  if (start < 0) return undefined;
  const rest = body.slice(start + marker.length);
  const stop = rest.indexOf(end);
  if (stop < 0) return undefined;
  try {
    return JSON.parse((rest.slice(0, stop) + close).replace(/\\/g, '')) as T;
  } catch {
    return undefined;
  }
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, ''),
    search: (query: string, page: number) => search(page, query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const body = await text(BASE_URL + manga.url);
      const document = html.load(body, { baseUrl: BASE_URL });
      const extra = embedded<MediaDto>(body, 'media', ',\\"trackers\\"', '}');
      const synopsis = document.selectFirst('section > div.flex + div p')?.text().trim() ?? extra?.synopsis;
      const alternative = (extra?.titles ?? []).map(
        (t) => `\n\t${LANGUAGES[t.language.split('_')[0] ?? ''] ?? t.language}: ${t.title}`,
      );
      return {
        url: manga.url,
        title: document.selectFirst('p.media-title')?.text().trim() ?? manga.title,
        thumbnailUrl:
          document.selectFirst('section:has(h2) img')?.absUrl('srcset')?.split(' ')[0] || manga.thumbnailUrl,
        genres: (extra?.genres ?? []).map((g) => GENRES[g] ?? g),
        status: extra?.status === 'FINISHED' ? 'completed' : extra?.status === 'RELEASING' ? 'ongoing' : 'unknown',
        description: `${synopsis ? `${htmlToText(synopsis)}\n\n` : ''}${alternative.length ? `Títulos alternativos:${alternative.join('')}` : ''}`,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = manga.url.replace('/media/', '').replace(/\/$/, '');
      const chapters: Chapter[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const input = encodeURIComponent(JSON.stringify({ '0': { json: { mediaId: id, page, perPage: 50 } } }));
        const raw = await text(`${BASE_URL}/api/trpc/chapters.getByMediaId?batch=1&input=${input}`);
        const found = /(\{"chapters".+"totalPages":\d+\})/.exec(raw)?.[1];
        if (!found) throw new Error('Capítulos não encontrados');
        const parsed = JSON.parse(found) as {
          chapters: { id: string; number: number; title?: string | null; createdAt?: string | null }[];
          totalPages: number;
        };
        totalPages = parsed.totalPages;
        for (const c of parsed.chapters) {
          const time = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
          chapters.push({
            url: `/chapter/${c.id}/1`,
            name: c.title?.trim() || `Capítulo ${String(c.number).replace(/\.0$/, '')}`,
            number: c.number,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          });
        }
        page++;
      } while (page <= totalPages);
      return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = await text(BASE_URL + chapter.url);
      const dto = embedded<{ id: string; media: { id: string }; pages: { id: string }[] }>(
        body,
        'mediaChapter',
        ',\\"chapters\\"',
        '}}',
      );
      if (!dto) throw new Error('Páginas não encontradas');
      const base = `${IMG_CDN}/${dto.media.id}/chapters/${dto.id}`;
      return dto.pages.map((p, index) => ({ index, imageUrl: `${base}/${p.id}.jpg` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/media\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/media/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
