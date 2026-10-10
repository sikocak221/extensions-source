import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, withQuery } from './common/utils';
import { type Message, decode, int, msg, msgs, str, strs } from './proto';

const BASE_URL = 'https://mangamillion.shueisha.co.jp';
const API_URL = 'https://api.mangamillion.shueisha.co.jp/api';

const SERVICE_LANGUAGES = ['de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko-KR', 'pt-BR', 'ru', 'th', 'vi', 'zh-CN'];

let token = '';

const hex = (text: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2) out.push(Number.parseInt(text.slice(i, i + 2), 16));
  return out;
};

async function getToken(serviceLang: string, rejected = ''): Promise<string> {
  if (token && token !== rejected) return token;
  const stored = await storage.get<string>('access_token');
  if (stored && stored !== rejected) return (token = stored);
  const response = await http.post(withQuery(`${API_URL}/register`, { service_language: serviceLang }), '', {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    responseType: 'bytes',
  });
  const accessToken = str(msg(decode(base64.decodeBytes(response.body as string)), 170), 1);
  if (!accessToken) throw new Error('Could not register an access token');
  await storage.set('access_token', accessToken);
  return (token = accessToken);
}

async function api(path: string, params: Record<string, string>, serviceLang: string): Promise<Message> {
  const url = withQuery(`${API_URL}/${path}`, { service_language: serviceLang, avif_enable: 'true', ...params });
  let used = await getToken(serviceLang);
  for (let attempt = 0; ; attempt++) {
    const response = await http.request({
      url,
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', 'Access-Token': used },
      responseType: 'bytes',
    });
    if (response.status === 403 && attempt === 0) {
      used = await getToken(serviceLang, used);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return decode(base64.decodeBytes(response.body as string));
  }
}

interface Series {
  id: number;
  cover?: string;
  name: string;
  views: number;
  uploadTime: number;
  languages: string[];
}

function seriesList(root: Message, field: number): Series[] {
  return msgs(msg(root, field), 1).flatMap((entry) => {
    const s = msg(entry, 1);
    if (!s) return [];
    return [
      {
        id: int(s, 1) ?? 0,
        cover: str(s, 2),
        name: str(s, 3) ?? '',
        views: int(s, 7) ?? 0,
        uploadTime: int(s, 9) ?? 0,
        languages: strs(entry, 2),
      },
    ];
  });
}

const toSummary = (s: Series): MangaSummary => ({ url: `/title/${s.id}`, title: s.name, thumbnailUrl: s.cover });

const tagFilter = (id: string, label: string, tags: Message[]): Filter => ({
  type: 'group',
  id,
  label,
  filters: tags.map((t): Filter => ({ type: 'checkbox', id: `${id}:${int(t, 1)}`, label: str(t, 2) ?? '' })),
});

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const lang = info.lang;
    const serviceLang = SERVICE_LANGUAGES.includes(lang) ? lang : 'en';

    return {
      baseUrl: BASE_URL,

      async getPopular(): Promise<MangaPage> {
        const root = await api('manga_list', {}, serviceLang);
        const items = seriesList(root, 22)
          .filter((s) => s.languages.includes(lang))
          .sort((a, b) => b.views - a.views)
          .map(toSummary);
        return { items, hasNextPage: false };
      },

      async getLatest(): Promise<MangaPage> {
        const root = await api('manga_list', {}, serviceLang);
        const items = seriesList(root, 22)
          .filter((s) => s.languages.includes(lang))
          .sort((a, b) => b.uploadTime - a.uploadTime)
          .map(toSummary);
        return { items, hasNextPage: false };
      },

      async getFilters(): Promise<Filter[]> {
        const root = await api('search_parameter', {}, serviceLang).catch(() => undefined);
        const parameter = msg(root, 21);
        const groups: [string, string, number][] = [
          ['genre', 'Genre', 2],
          ['theme', 'Theme', 3],
          ['highlight', 'Highlights', 4],
          ['rating', 'Rating', 5],
        ];
        return groups.flatMap(([id, label, field]) => {
          const tags = msgs(parameter, field);
          return tags.length ? [tagFilter(id, label, tags)] : [];
        });
      },

      async search(query: string, _page: number, state: FilterState): Promise<MangaPage> {
        const ids = (group: string) =>
          Object.entries(state)
            .filter(([key, value]) => key.startsWith(`${group}:`) && value === true)
            .map(([key]) => key.slice(group.length + 1));
        const tagIds = ['genre', 'theme', 'highlight'].flatMap(ids);
        const ratingIds = ids('rating');
        const params: Record<string, string> = { translated_language: lang };
        if (query.trim()) params.text = query;
        if (tagIds.length) params.tag_id = tagIds.join(',');
        if (ratingIds.length) params.rating_id = ratingIds.join(',');
        const root = await api('search', params, serviceLang);
        return {
          items: seriesList(root, 20)
            .filter((s) => s.languages.includes(lang))
            .map(toSummary),
          hasNextPage: false,
        };
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const root = await api('title_detail', { original_title_id: manga.url.split('/').pop()! }, serviceLang);
        const details = msg(msg(root, 50), 1);
        if (!details) throw new Error('Title not found');
        return {
          url: manga.url,
          title: str(details, 2) ?? manga.title,
          thumbnailUrl: str(details, 1) ?? manga.thumbnailUrl,
          author: str(details, 3),
          description: str(details, 7),
          genres: msgs(details, 4)
            .map((t) => str(t, 2) ?? '')
            .filter(Boolean),
          status: 'unknown',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const titleId = manga.url.split('/').pop()!;
        const root = await api('chapter_list', { original_title_id: titleId, translated_language: lang }, serviceLang);
        const chapters = msgs(msg(root, 60), 2)
          .flatMap((group) => msgs(group, 2))
          .filter((c) => int(c, 3) !== undefined)
          .map((c): Chapter => {
            const number = str(c, 1) ?? '';
            return {
              url: `/title/${titleId}/chapter/${int(c, 3)}`,
              name: str(c, 2) ?? number,
              number: chapterNumber(number),
            };
          });
        return chapters.reverse();
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const root = await api(
          'viewer',
          { translated_chapter_id: chapter.url.split('/').pop()!, quality: 'middle' },
          serviceLang,
        );
        const viewer = msg(root, 70);
        const key = str(viewer, 7) ?? '';
        const iv = str(viewer, 8) ?? '';
        return msgs(viewer, 1).map((p, index) => ({ index, imageUrl: `${str(p, 1) ?? ''}#${key}:${iv}` }));
      },

      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

      transformImage(page: Page, bytes: Uint8Array): ImageTransform {
        const fragment = page.imageUrl?.split('#')[1];
        if (!fragment?.includes(':')) return {};
        const [key, iv] = fragment.split(':') as [string, string];
        return { bytes: crypto.aesDecrypt(bytes, hex(key), { mode: 'cbc', iv: hex(iv) }) };
      },

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?mangamillion\.shueisha\.co\.jp\/[^/]+\/title\/(\d+)/i.exec(url.trim());
        return match ? { url: `/title/${match[1]}`, title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}/${serviceLang}${item.url}`,
    };
  },
});

function chapterNumber(text: string): number | undefined {
  if (!text.startsWith('#')) return undefined;
  const numbers = text.slice(1);
  let value: number;
  if (numbers.includes(',')) value = Number.parseFloat(numbers.split(',')[0]!);
  else if (numbers.includes('-')) {
    const [a = '', b = ''] = numbers.split('-', 2);
    value = b.length >= 3 || !b ? Number.parseFloat(a) : Number.parseFloat(`${a}.${b}`);
  } else value = Number.parseFloat(numbers);
  return Number.isNaN(value) ? undefined : value;
}
