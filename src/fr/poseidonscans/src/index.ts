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
import { USER_AGENT, relativeUrl } from './common/utils';

const BASE_URL = 'https://poseidon-scans.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, RSC: '1' };

const SHOW_PREMIUM_PREFERENCE: Preference = {
  type: 'switch',
  key: 'show_premium_chapters',
  label: 'Show premium chapters',
  description: 'Show paid chapters (identified by 🔒) in the list.',
  default: false,
};

interface ChapterData {
  number: number;
  title?: string | null;
  createdAt: string;
  isPremium?: boolean | null;
  premiumUntil?: string | null;
  isVolume?: boolean | null;
}

interface MangaData {
  title: string;
  slug: string;
  description: string;
  status: string;
  artist?: string | null;
  author?: string | null;
  categories?: { name: string }[];
  chapters: ChapterData[];
}

/**
 * First object of an RSC payload (lines of `<id>:<json>`) that matches `predicate`. The chapter pages nest their
 * props deeper than the shared finder looks, so the tree is walked without a depth limit.
 */
function findRscObject<T>(body: string, predicate: (value: Record<string, unknown>) => boolean): T | undefined {
  for (const line of body.split('\n')) {
    const row = /^[0-9a-f]+:([[{].*)$/.exec(line)?.[1];
    if (!row) continue;
    let root: unknown;
    try {
      root = JSON.parse(row);
    } catch {
      continue;
    }
    const stack: unknown[] = [root];
    while (stack.length > 0) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      if (!Array.isArray(value) && predicate(value as Record<string, unknown>)) return value as T;
      const children = Array.isArray(value) ? value : Object.values(value);
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }
  return undefined;
}

const coverUrl = (slug: string) => `${BASE_URL}/api/covers/${slug}.webp`;

/** React Flight dates look like "$D2026-09-28T22:07:53.753Z". */
const flightTime = (value: string | null | undefined) => (value ? Date.parse(value.replace(/^\$D/, '')) || 0 : 0);

const toSummary = (slug: string, title: string): MangaSummary => ({
  url: `/serie/${slug}`,
  title,
  thumbnailUrl: coverUrl(slug),
});

const get = async (url: string, extra: Record<string, string> = rscHeaders) =>
  (await http.get(url, { headers: extra })).body;

function parseStatus(text: string | undefined): MangaStatus {
  switch (text?.trim().toLowerCase()) {
    case 'en cours':
      return 'ongoing';
    case 'terminé':
      return 'completed';
    case 'en pause':
    case 'hiatus':
      return 'hiatus';
    case 'annulé':
    case 'abandonné':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function chapterList(body: string): Chapter[] | null {
  const page = findRscObject<{ isPremiumUser?: boolean | null; manga: MangaData }>(
    body,
    (v) => 'isPremiumUser' in v && typeof v.manga === 'object' && Array.isArray((v.manga as MangaData)?.chapters),
  );
  if (!page) return null;
  const showPremium = prefs.get<boolean>(SHOW_PREMIUM_PREFERENCE.key) ?? false;
  const chapters: Chapter[] = [];
  for (const ch of page.manga.chapters) {
    const isLocked = ch.isPremium === true && page.isPremiumUser !== true;
    const premiumUntil = flightTime(ch.premiumUntil);
    if (isLocked && !showPremium && Date.now() <= premiumUntil) continue;
    const number = String(ch.number).replace(/\.0$/, '');
    const isVolume = ch.isVolume === true || (ch.number % 1 === 0 && !!ch.title?.toLowerCase().includes('volume'));
    const base = isVolume ? `Volume ${number}` : `Chapitre ${number}`;
    const title = ch.title?.trim();
    let name = `${isLocked ? '🔒 ' : ''}${title ? `${base} - ${title}` : base}`;
    if (isLocked) {
      const free = new Date(premiumUntil);
      const day = String(free.getDate()).padStart(2, '0');
      const month = free.toLocaleString('fr-FR', { month: 'long' });
      const time = `${String(free.getHours()).padStart(2, '0')}:${String(free.getMinutes()).padStart(2, '0')}`;
      name += ` - Free the ${day} ${month} at ${time}`;
    }
    chapters.push({
      url: `/serie/${page.manga.slug}/chapter/${number}`,
      name: name.trim(),
      number: ch.number,
      uploadedAt: flightTime(ch.createdAt) || undefined,
    });
  }
  return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
}

export default defineExtension({
  preferences: () => [SHOW_PREMIUM_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const body = await get(BASE_URL);
      const popular = findRscObject<{ initialData: { slug: string; title: string }[] }>(
        body,
        (v) =>
          Array.isArray(v.initialData) &&
          typeof (v.initialData[0] as { slug?: unknown } | undefined)?.slug === 'string' &&
          typeof (v.initialData[0] as { title?: unknown } | undefined)?.title === 'string',
      );
      if (!popular) throw new Error('Cant scape data from Next.js');
      return { items: popular.initialData.map((m) => toSummary(m.slug, m.title)), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      const response = JSON.parse(await get(`${BASE_URL}/api/manga/lastchapters?limit=16&page=${page}`, headers)) as {
        data?: { title: string; slug: string }[];
      };
      const items = (response.data ?? []).map((m) => toSummary(m.slug, m.title));
      return { items, hasNextPage: items.length === 16 };
    },
    async search(query, page): Promise<MangaPage> {
      let url = `${BASE_URL}/series`;
      const params: string[] = [];
      if (query.trim()) params.push(`search=${encodeURIComponent(query)}`);
      if (page > 1) params.push(`page=${page}`);
      if (params.length) url += `?${params.join('&')}`;
      const response = await http.get(url, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const items = document.select('div.grid a.block.group').flatMap((element): MangaSummary[] => {
        const title = element.selectFirst('h2')?.text();
        if (!title) return [];
        const srcset = element.selectFirst('img[alt]')?.attr('srcset')?.split(' ')[0];
        const path = srcset ? decodeURIComponent(srcset).split('url=')[1]?.split('&')[0] : undefined;
        const cover = path
          ? path.startsWith('http')
            ? path
            : path.startsWith('/')
              ? `${BASE_URL}${path}`
              : `${BASE_URL}/api/covers/${path}`
          : undefined;
        return [{ url: relativeUrl(element.attr('href') ?? ''), title, thumbnailUrl: cover }];
      });
      return {
        items,
        hasNextPage: document.select('nav[aria-label=Pagination] a').some((a) => a.text().includes('Suivant')),
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const body = await get(`${BASE_URL}${manga.url}`);
      const data = findRscObject<MangaData>(
        body,
        (v) =>
          typeof v.slug === 'string' && Array.isArray(v.chapters) && typeof v.title === 'string' && 'description' in v,
      );
      if (!data) throw new Error('Cant scape data from Next.js');
      return {
        url: `/serie/${data.slug}`,
        title: data.title,
        thumbnailUrl: coverUrl(data.slug),
        author: data.author ?? undefined,
        artist: data.artist ?? undefined,
        genres: (data.categories ?? [])
          .map((c) => c.name.trim())
          .filter(Boolean)
          .map(titleCase),
        status: parseStatus(data.status),
        description: data.description.trim() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const url = `${BASE_URL}${manga.url}`;
      const first = chapterList(await get(url));
      if (first === null) throw new Error('Cant scape data from Next.js');
      if (first.length > 0) return first;
      // RSC data can be partial on first load: ask again.
      return chapterList(await get(`${url}?_=1`)) ?? [];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = await get(`${BASE_URL}${chapter.url}`);
      // The props sit in rows whose text may span lines (length-prefixed chunks): read the fields from the text.
      const imagesJson = /"images":(\[\{[^\]]*\}\])/.exec(body)?.[1];
      if (!imagesJson) throw new Error('Cant scape data from Next.js');
      const isPremium = /"currentChapter":\{[^}]*?"isPremium":(true|false)/.exec(body)?.[1] === 'true';
      if (isPremium) {
        if (/"sessionStatus":"unauthenticated"/.test(body)) {
          throw new Error('This chapter is premium. Please connect via the WebView to view.');
        }
        if (!/"isPremiumUser":true/.test(body)) throw new Error('This chapter is premium. You are not a premium user.');
      }
      const data = { initialData: { images: JSON.parse(imagesJson) as { originalUrl: string; order: number }[] } };
      return data.initialData.images
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((image, index) => ({
          index,
          imageUrl: image.originalUrl.startsWith('http') ? image.originalUrl : `${BASE_URL}${image.originalUrl}`,
        }));
    },
    imageHeaders: () => ({
      ...headers,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    }),
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?poseidon-scans\.net\/serie\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/serie/${slug}`, title: '' } : null;
    },
  }),
});
