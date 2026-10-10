import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://aniargos.com';
const WARNING = 'Credenciais não encontradas. Faça login na web view';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, rsc: '1' };

interface MangaDto {
  id: string;
  title: string;
  cover_image: string;
  link: string;
  status?: string;
}
interface Named {
  name: string;
}
interface DetailsDto {
  title: string;
  alt_titles?: string[];
  cover_image: string;
  status?: string;
  synopsis: string;
  genders?: Named[];
  artists?: Named[];
  authors?: Named[];
  isUpcoming?: boolean;
}

const STATUS: Record<string, MangaStatus> = {
  active: 'ongoing',
  up_to_date: 'ongoing',
  coming_soon: 'ongoing',
  hiatus: 'hiatus',
  finished: 'completed',
};

const summary = (m: MangaDto): MangaSummary => ({
  url: `/${m.id}/${m.link}`,
  title: m.title,
  thumbnailUrl: m.cover_image,
});

/** Next.js server action ids, found in the site's script chunks. */
const tokens: Record<string, string> = {};

async function findToken(url: string, name: string): Promise<string> {
  if (tokens[name]) return tokens[name]!;
  const regex = new RegExp(`createServerReference\\)\\("([0-9a-f]+)",[^"]*?,"${name}"\\)`);
  const page = await http.request<string>({ url, headers });
  if (page.url.includes('/login')) throw new Error('Acesse sua conta');
  const body = page.body;
  const doc = html.load(body, { baseUrl: url });
  const scripts = new Set<string>();
  for (const s of doc.select('script[src*=chunks]')) {
    const src = s.absUrl('src');
    if (src) scripts.add(src);
  }
  for (const m of body.matchAll(/\/_next\/static\/chunks\/[\w.-]+\.js/g)) scripts.add(BASE_URL + m[0]);
  for (const src of [...scripts].reverse()) {
    const js = (await http.request<string>({ url: src, headers })).body;
    const found = regex.exec(js)?.[1];
    if (found) return (tokens[name] = found);
  }
  throw new Error(WARNING);
}

async function action(url: string, name: string, payload: unknown[]): Promise<string> {
  const token = await findToken(url, name);
  // The marker query keeps actions on the same page apart (the page ignores it; recorded fixtures key on the url).
  const response = await http.request<string>({
    url: `${url}${url.includes('?') ? '&' : '?'}_action=${name}`,
    method: 'POST',
    headers: {
      ...headers,
      'Next-Action': token,
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
    },
    body: JSON.stringify(payload),
  });
  if (response.url.includes('/login')) throw new Error('Acesse sua conta');
  return response.body;
}

/** Rows of an RSC payload (`<id>:<json>`), parsed. */
function rows(body: string): unknown[] {
  const out: unknown[] = [];
  for (const line of body.split('\n')) {
    const m = /^[0-9a-f]+:([[{].*)$/.exec(line);
    if (!m) continue;
    try {
      out.push(JSON.parse(m[1]!));
    } catch {
      // Not json: skipped.
    }
  }
  return out;
}

const segments = (url: string) => relativeUrl(url).split('/').filter(Boolean);

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      const body = (await http.get(`${BASE_URL}/projetos?page=${page}`, { headers: rscHeaders })).body;
      const dto = findRscObject<{ projects: MangaDto[]; pagination: { hasNextPage: boolean } }>(
        body,
        (v) => Array.isArray(v.projects) && typeof v.pagination === 'object',
      );
      return { items: (dto?.projects ?? []).map(summary), hasNextPage: dto?.pagination.hasNextPage ?? false };
    },
    async getLatest(): Promise<MangaPage> {
      const body = (await http.get(BASE_URL, { headers: rscHeaders })).body;
      const dto = findRscObject<{ lastUpdates: MangaDto[] }>(body, (v) => Array.isArray(v.lastUpdates));
      return { items: (dto?.lastUpdates ?? []).map(summary), hasNextPage: false };
    },
    async search(query: string): Promise<MangaPage> {
      const body = await action(BASE_URL, 'search', [query]);
      const list = rows(body).find((r): r is MangaDto[] => Array.isArray(r)) ?? [];
      return { items: list.map(summary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const url = BASE_URL + manga.url;
      const body = await action(url, 'getOne', segments(manga.url));
      const dto = rows(body).find(
        (r): r is DetailsDto => !!r && typeof r === 'object' && !Array.isArray(r) && 'synopsis' in r,
      );
      if (!dto) throw new Error('Detalhes não encontrados');
      const join = (list?: Named[]) => list?.map((n) => n.name).join(', ') || undefined;
      return {
        url: manga.url,
        title: dto.title,
        thumbnailUrl: dto.cover_image,
        description: `${dto.synopsis}${dto.alt_titles?.length ? `\n\nTitulos alternativos: ${dto.alt_titles.join(', ')}` : ''}`,
        genres: dto.genders?.map((g) => g.name),
        author: join(dto.authors),
        artist: join(dto.artists),
        status: STATUS[(dto.status ?? '').toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const body = await action(BASE_URL + manga.url, 'getAllChapters', segments(manga.url));
      const dto = rows(body).find(
        (r): r is { groups: { chapters: { id: string; title: number; created_at: string }[] }[] } =>
          !!r && typeof r === 'object' && 'groups' in r,
      );
      const chapters: Chapter[] = [];
      for (const group of dto?.groups ?? [])
        for (const c of group.chapters) {
          const number = Number(c.title);
          const time = Date.parse(c.created_at);
          chapters.push({
            url: `${manga.url}/capitulo/${number}`,
            name: String(number),
            number,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          });
        }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const parts = segments(chapter.url);
      const body = await action(BASE_URL + chapter.url, 'getPages', [parts[0], parts[parts.length - 1]]);
      const details = rows(body).find((r): r is DetailsDto => !!r && typeof r === 'object' && 'isUpcoming' in r);
      if (details?.isUpcoming) throw new Error('Capítulo em desenvolvimento');
      const dto = rows(body).find(
        (r): r is { pages: { photo: string }[] } =>
          !!r && typeof r === 'object' && Array.isArray((r as { pages?: unknown }).pages),
      );
      return (dto?.pages ?? []).map((p, index) => ({ index, imageUrl: p.photo }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const parts = segments(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && parts.length >= 2
        ? { url: `/${parts[0]}/${parts[1]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
