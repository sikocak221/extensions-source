import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

const BASE_URL = 'https://www.peppercarrot.com';
const TITLE = 'Pepper&Carrot';
const AUTHOR = 'David Revoy';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const ARTWORKS = [
  'artworks', 'wallpapers', 'sketchbook', 'misc', 'book-publishing', 'comissions', 'eshop', 'framasoft', 'press',
  'references', 'wiki',
]; // prettier-ignore

interface LangInfo {
  key: string;
  name: string;
  code: string;
  translators: string;
  translated: number;
  total: number;
}

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

let langCache: { at: number; list: LangInfo[] } | undefined;

async function langs(): Promise<LangInfo[]> {
  if (langCache && Date.now() - langCache.at < 3_600_000) return langCache.list;
  const [langsJson, episodes] = await Promise.all([
    http.get<Record<string, { translators: string[]; local_name: string; iso_code: string }>>(
      `${BASE_URL}/0_sources/langs.json`,
      {
        headers,
        responseType: 'json',
      },
    ),
    http.get<{ translated_languages: string[] }[]>(`${BASE_URL}/0_sources/episodes.json`, {
      headers,
      responseType: 'json',
    }),
  ]);
  const counts: Record<string, number> = {};
  for (const episode of episodes.body)
    for (const key of episode.translated_languages) counts[key] = (counts[key] ?? 0) + 1;
  const total = episodes.body.length;
  const list = Object.entries(langsJson.body)
    .map(([key, dto]) => ({
      key,
      name: dto.local_name,
      code: dto.iso_code || key,
      translators: dto.translators.join(', '),
      translated: counts[key] ?? 0,
      total,
    }))
    .filter((l) => l.translated > 0)
    .sort((a, b) => b.translated - a.translated);
  langCache = { at: Date.now(), list };
  return list;
}

const selectedLangs = async (): Promise<string[]> => (await storage.get<string[]>('lang')) ?? ['en'];

const langTitle = (key: string) => (key === 'en' ? TITLE : `${TITLE} (${key.toUpperCase()})`);

const artworkEntry = (key: string): MangaSummary => ({
  url: `/#${key}`,
  title: key === 'comissions' ? 'Commissions' : key === 'eshop' ? 'Shop' : key.charAt(0).toUpperCase() + key.slice(1),
  thumbnailUrl: `${BASE_URL}/0_sources/0ther/press/low-res/2015-10-12_logo_by-David-Revoy.jpg`,
});

const COVER = `${BASE_URL}/0_sources/0ther/artworks/low-res/2016-02-24_vertical-cover_remake_by-David-Revoy.jpg`;
const MFT_COVER = `${BASE_URL}/0_sources/0ther/artworks/low-res/2018-11-22_vertical-cover-book-three_by-David-Revoy.jpg`;
const MFT_DESCRIPTION =
  'A webcomic series featuring short stories set in the enchanting world of Pepper&Carrot. With its playful humor and whimsical tales, this collection of gag strips is perfect for audiences of all ages.';

const mft = (key: string): MangaSummary => ({
  url: `/miniFantasyTheater#${key}`,
  title: `Mini Fantasy Theater${key === 'en' ? '' : ` (${key.toUpperCase()})`}`,
  thumbnailUrl: MFT_COVER,
});

async function list(): Promise<MangaPage> {
  const keys = await selectedLangs();
  const info = await langs();
  const known = keys.filter((k) => info.some((l) => l.key === k));
  const main = known.map((key): MangaSummary => ({ url: `/${key}`, title: langTitle(key), thumbnailUrl: COVER }));
  return { items: [...main, ...known.map(mft), ...ARTWORKS.map(artworkEntry)], hasNextPage: false };
}

const listUrl = (raw: string) => listUrlOf(raw.replace(/^\//, ''));
const listUrlOf = (key: string) =>
  key.startsWith('#')
    ? `${BASE_URL}/0_sources/0ther/${key.slice(1)}/low-res/`
    : key.startsWith('miniFantasyTheater')
      ? `${BASE_URL}/${key.split('#')[1]}/webcomics/miniFantasyTheater.html`
      : `${BASE_URL}/${key}/webcomics/peppercarrot.html`;

const dateRegex = /\d{4}-\d{2}-\d{2}/;

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: 'HI_RES',
      label: 'High resolution images',
      description: 'Changes will not be applied to images that are already cached or downloaded.',
      default: false,
    },
  ],

  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: list,

    async getFilters(): Promise<Filter[]> {
      const info = await langs();
      const selected = await selectedLangs();
      return [
        { type: 'header', label: 'Languages (applied when you search)' },
        ...info.map((l): Filter => ({
          type: 'checkbox',
          id: `lang:${l.key}`,
          label: `${l.name} (${l.translated}/${l.total} translated)`,
          default: selected.includes(l.key),
        })),
      ];
    },

    async search(query: string, _page: number, state: FilterState): Promise<MangaPage> {
      const keys = Object.entries(state)
        .filter(([id, value]) => id.startsWith('lang:') && value === true)
        .map(([id]) => id.slice(5));
      if (keys.length) await storage.set('lang', keys);
      const result = await list();
      // The site has no search: filter the listing by title.
      const q = query.trim().toLowerCase();
      return q ? { ...result, items: result.items.filter((m) => m.title.toLowerCase().includes(q)) } : result;
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const key = manga.url.replace(/^\//, '');
      if (key.startsWith('#'))
        return { ...artworkEntry(key.slice(1)), url: manga.url, status: 'ongoing', author: AUTHOR };
      const info = await langs();
      if (key.startsWith('miniFantasyTheater')) {
        return {
          ...mft(key.split('#')[1]!),
          url: manga.url,
          author: AUTHOR,
          description: MFT_DESCRIPTION,
          status: 'ongoing',
        };
      }
      const lang = info.find((l) => l.key === key);
      return {
        url: manga.url,
        title: langTitle(key),
        thumbnailUrl: COVER,
        author: AUTHOR,
        description: `Language: ${lang?.name ?? key}\nTranslators: ${lang?.translators ?? ''}`,
        status: 'ongoing',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const key = manga.url.replace(/^\//, '');
      const response = await http.get(listUrl(key), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      if (key.startsWith('#')) {
        const baseDir = response.url.replace(BASE_URL, '');
        const chapters: Chapter[] = [];
        for (const a of document.select('a').reverse()) {
          const filename = a.attr('href') ?? '';
          if (!filename.endsWith('.jpg')) continue;
          const file = filename.replace(/\.jpg$/, '').replace(/_by-David-Revoy$/, '');
          const stripped = dateRegex.test(file.slice(0, 10)) ? file.slice(10) : file;
          const date = dateRegex.test(file.slice(0, 10)) ? file.slice(0, 10) : undefined;
          const name = stripped.replace(/[_-]/g, ' ').trim();
          chapters.push({
            url: baseDir + filename,
            name: name.charAt(0).toUpperCase() + name.slice(1),
            uploadedAt: parseDate(date, 'yyyy-MM-dd'),
          });
        }
        return chapters;
      }
      const figures = document.select('figure');
      const chapters: Chapter[] = [];
      for (const [index, figure] of figures.entries()) {
        if (!(figure.attr('class') ?? '').split(/\s+/).includes('translated')) continue;
        const link = figure.selectFirst('a');
        const title = figure.selectFirst('img')?.attr('title') ?? '';
        const cut = title.lastIndexOf('（');
        const name =
          cut >= 0
            ? title.slice(0, cut).trimEnd()
            : title.slice(0, title.lastIndexOf('(') >= 0 ? title.lastIndexOf('(') : undefined).trimEnd();
        const date = dateRegex.exec(figure.selectFirst('figcaption')?.text() ?? '')?.[0];
        chapters.push({
          url: (link?.attr('href') ?? '').replace(BASE_URL, ''),
          name,
          number: figures.length - index,
          uploadedAt: parseDate(date, 'yyyy-MM-dd'),
        });
      }
      return chapters;
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const hiRes = prefs.get<boolean>('HI_RES') === true;
      const fix = (u: string) => (hiRes ? u.replace('/low-res/', '/hi-res/') : u);
      if (chapter.url.endsWith('.jpg')) return [{ index: 0, imageUrl: fix(BASE_URL + chapter.url) }];
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      const urls = [
        ...document.select('.webcomic-page img').map((i) => i.attr('src') ?? ''),
        ...document.select('.mft-cv-image').map((i) => i.attr('src') ?? ''),
      ].filter(Boolean);
      if (urls.length === 0) return [];
      const thumbnail = urls[0]!.toLowerCase().includes('minifantasytheater')
        ? []
        : [urls[0]!.replace('P00.jpg', '.jpg')];
      return [...thumbnail, ...urls].map((u, index) => ({ index, imageUrl: fix(u) }));
    },

    imageHeaders: () => headers,

    getWebUrl(item: MangaSummary | Chapter): string {
      if ('title' in item) {
        const key = item.url.replace(/^\//, '');
        if (key.startsWith('#')) return `${BASE_URL}/en/files/${key.slice(1)}.html`;
        if (key.startsWith('miniFantasyTheater'))
          return `${BASE_URL}/${key.split('#')[1]}/webcomics/miniFantasyTheater.html`;
        return `${BASE_URL}/${key}/webcomics/peppercarrot.html`;
      }
      return `${BASE_URL}${item.url}`;
    },
  }),
});
