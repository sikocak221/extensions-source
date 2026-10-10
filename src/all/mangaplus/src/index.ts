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
import { type Message, decode, int, msg, msgs, str } from './proto';

const BASE_URL = 'https://mangaplus.shueisha.co.jp';
const API_URL = 'https://jumpg-webapi.tokyo-cdn.com/api';

const LANGS: Record<string, { name: string; code: number }> = {
  en: { name: 'eng', code: 0 },
  es: { name: 'esp', code: 1 },
  fr: { name: 'fra', code: 2 },
  id: { name: 'ind', code: 3 },
  'pt-BR': { name: 'ptb', code: 4 },
  ru: { name: 'rus', code: 5 },
  th: { name: 'tha', code: 6 },
  de: { name: 'deu', code: 7 },
  vi: { name: 'vie', code: 9 },
};

const session = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/** Token of the chapter that was opened last; image requests send it as Plus-Vw-Token. */
let viewToken = '';

interface Title {
  titleId: number;
  name: string;
  author?: string;
  portraitImageUrl: string;
  language: number;
}

function title(m: Message | undefined): Title | undefined {
  if (!m) return undefined;
  return {
    titleId: int(m, 1) ?? 0,
    name: str(m, 2) ?? '',
    author: str(m, 3),
    portraitImageUrl: str(m, 4) ?? '',
    language: int(m, 7) ?? 0,
  };
}

const toSummary = (t: Title): MangaSummary => ({
  url: `/titles/${t.titleId}`,
  title: t.name,
  thumbnailUrl: t.portraitImageUrl || undefined,
});

/** Calls the API and returns the `success` message, or throws the popup message of the error. */
async function api(path: string, params: Record<string, string>, langCode: number): Promise<Message> {
  const response = await http.get(withQuery(`${API_URL}/${path}`, params), {
    headers: { 'User-Agent': USER_AGENT, Origin: BASE_URL, Referer: `${BASE_URL}/`, 'SESSION-TOKEN': session },
    responseType: 'bytes',
  });
  const root = decode(base64.decodeBytes(response.body as string));
  const success = msg(root, 1);
  if (success) return success;
  const error = msg(root, 2);
  const popup = msg(error, langCode === 1 ? 3 : 2) ?? msg(error, 2);
  if (str(popup, 1) === 'Not Found') throw new Error('Not found (the title or chapter was removed or has expired)');
  throw new Error(str(popup, 2) || 'Unknown error');
}

const option = (label: string, value: string) => ({ label, value });
const TYPES = ['serializing', 'completed', 'one-shot'];

function unique<T extends { titleId: number }>(titles: T[]): T[] {
  const seen = new Set<number>();
  return titles.filter((t) => t.titleId !== 0 && !seen.has(t.titleId) && seen.add(t.titleId));
}

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: 'imageResolution',
      label: 'Image quality',
      options: [option('Low', 'low'), option('Medium', 'high'), option('High', 'super_high')],
      default: 'super_high',
    },
    {
      type: 'switch',
      key: 'splitImage',
      label: 'Split double pages',
      description: 'Splits double pages into two (may require a refresh of the chapter)',
      default: true,
    },
    {
      type: 'switch',
      key: 'subtitleOnly',
      label: 'Show only the chapter subtitle',
      description: 'Use only the subtitle as chapter name',
      default: false,
    },
  ],

  createSource: (info: SourceInfo) => {
    const lang = LANGS[info.lang] ?? LANGS.en!;
    const clang = { clang: lang.name };
    const byLang = (titles: Title[]) => unique(titles.filter((t) => t.language === lang.code));
    const allTitlesV3 = async (type: string) =>
      msg(await api('title_list/all_v3', { type, lang: lang.name, ...clang }, lang.code), 35);

    return {
      baseUrl: BASE_URL,

      async getPopular(): Promise<MangaPage> {
        const success = await api('title_list/rankingV2', { lang: lang.name, type: 'hottest', ...clang }, lang.code);
        const titles = msgs(msg(success, 37), 3).flatMap((ranked) => msgs(ranked, 2).map(title));
        return { items: byLang(titles.filter((t): t is Title => !!t)).map(toSummary), hasNextPage: false };
      },

      async getLatest(): Promise<MangaPage> {
        const success = await api('web/web_homeV4', { lang: lang.name, ...clang }, lang.code);
        const home = msg(success, 38);
        const entries = [...msgs(home, 2).flatMap((group) => msgs(group, 2)), ...msgs(msg(home, 7), 2)];
        const titles = entries
          .sort((a, b) => (int(b, 6) ?? 0) - (int(a, 6) ?? 0))
          .flatMap((entry) => msgs(entry, 3).map((chapter) => title(msg(chapter, 1))))
          .filter((t): t is Title => !!t);
        return { items: byLang(titles).map(toSummary), hasNextPage: false };
      },

      async getFilters(): Promise<Filter[]> {
        const view = await allTitlesV3('serializing').catch(() => undefined);
        const tags = msgs(view, 2).map((tag) => option(str(tag, 1) ?? '', str(tag, 2) ?? ''));
        return [
          {
            type: 'select',
            id: 'type',
            label: 'Status',
            options: [
              option('Serializing', 'serializing'),
              option('Completed', 'completed'),
              option('One-shot', 'one-shot'),
            ],
          },
          ...(tags.length
            ? [{ type: 'select', id: 'genre', label: 'Genre', options: [option('All', ''), ...tags] } as Filter]
            : []),
        ];
      },

      async search(query: string, _page: number, state: FilterState): Promise<MangaPage> {
        const type = typeof state.type === 'string' && TYPES.includes(state.type) ? state.type : 'serializing';
        const genre = typeof state.genre === 'string' ? state.genre : '';
        let titles: Title[];
        // allV2 returns everything while v3 returns based on the type filter (serializations/completed etc.)
        if (query && !genre && type === 'serializing') {
          const success = await api('title_list/allV2', {}, lang.code);
          titles = msgs(msg(success, 25), 1)
            .flatMap((group) => msgs(group, 2).map(title))
            .filter((t): t is Title => !!t);
        } else {
          const view = await allTitlesV3(type);
          titles = msgs(view, 3)
            .filter((entry) => !genre || msgs(entry, 3).some((g) => str(g, 2) === genre))
            .map((entry) => title(msg(entry, 2)))
            .filter((t): t is Title => !!t);
        }
        const q = query.toLowerCase();
        const filtered = byLang(titles).filter(
          (t) => !q || t.name.toLowerCase().includes(q) || (t.author ?? '').toLowerCase().includes(q),
        );
        return { items: filtered.map(toSummary), hasNextPage: false };
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const detail = await titleDetail(manga.url, lang);
        const t = title(msg(detail, 1))!;
        const overview = str(detail, 3) ?? '';
        const period = str(detail, 7) ?? '';
        const nonAppearance = str(detail, 8) ?? '';
        const genres = msgs(detail, 31);
        const oneShot = genres.some((g) => str(g, 2) === 'one-shot');
        const authors = t.author?.replace(/ \/ /g, ', ');
        return {
          url: manga.url,
          title: t.name,
          thumbnailUrl: t.portraitImageUrl || manga.thumbnailUrl,
          author: authors,
          artist: authors,
          description: [overview, period].filter(Boolean).join('\n\n') || undefined,
          genres: genres.map((g) => str(g, 1)).filter((g): g is string => !!g),
          status:
            oneShot || /completado|completed?|completo/i.test(nonAppearance) || period.includes('latest 0 chapters')
              ? 'completed'
              : /on a hiatus/i.test(nonAppearance)
                ? 'hiatus'
                : 'ongoing',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const detail = await titleDetail(manga.url, lang);
        const subtitleOnly = prefs.get<boolean>('subtitleOnly') === true;
        const chapters = msgs(detail, 28)
          .flatMap((group) => [...msgs(group, 2), ...msgs(group, 4)])
          .filter((c) => str(c, 4) !== undefined) // no subtitle = expired
          .map((c): Chapter => {
            const name = str(c, 3) ?? '';
            const sub = str(c, 4)!;
            return {
              url: `/viewer/${int(c, 2)}`,
              name: subtitleOnly ? sub : `${name} - ${sub}`,
              number: Number.parseFloat(name.split('#')[1] ?? ''),
              scanlator: 'MANGA Plus',
              uploadedAt: (int(c, 6) ?? 0) * 1000,
            };
          });
        return chapters.reverse();
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const chapterId = chapter.url.split('/').pop()!;
        const success = await api(
          'manga_viewer_v3',
          {
            chapter_id: chapterId,
            split: prefs.get<boolean>('splitImage') === false ? 'no' : 'yes',
            img_quality: prefs.get<string>('imageResolution') ?? 'super_high',
            ...clang,
          },
          lang.code,
        );
        const viewer = msg(success, 10);
        viewToken = str(viewer, 19) ?? '';
        return msgs(viewer, 1)
          .map((p) => msg(p, 1))
          .filter((p): p is Message => !!p)
          .map((p, index) => ({ index, imageUrl: (str(p, 1) ?? '') + (str(p, 5) ? `#${str(p, 5)}` : '') }));
      },

      imageHeaders: () => ({
        'User-Agent': USER_AGENT,
        Referer: `${BASE_URL}/`,
        Origin: BASE_URL,
        'Plus-Vw-Token': viewToken,
      }),

      async transformImage(page: Page, bytes: Uint8Array): Promise<ImageTransform> {
        const key = page.imageUrl?.split('#')[1];
        if (!key) return {};
        const stream: number[] = [];
        for (let i = 0; i + 1 < key.length; i += 2) stream.push(Number.parseInt(key.slice(i, i + 2), 16));
        if (stream.length === 0) return {};
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
          out[i] = bytes[i]! ^ stream[i % stream.length]!;
          if (i % 400_000 === 399_999) await timers.sleep(0);
        }
        return { bytes: out };
      },

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?mangaplus\.shueisha\.co\.jp\/titles\/(\d+)/i.exec(url.trim());
        return match ? { url: `/titles/${match[1]}`, title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});

async function titleDetail(url: string, lang: { name: string; code: number }): Promise<Message> {
  const id = url.split('/').pop()!;
  const success = await api('title_detailV3', { title_id: id, clang: lang.name }, lang.code);
  const detail = msg(success, 8);
  if (!detail || title(msg(detail, 1))?.language !== lang.code) throw new Error('Not available in this language');
  return detail;
}
