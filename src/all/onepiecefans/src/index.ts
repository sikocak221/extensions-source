import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://one-piece-fans2.com';
const DEFAULT_THUMBNAIL = `${BASE_URL}/images/luffy.png`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const getJson = async <T>(url: string): Promise<T> => (await http.get<T>(url, { headers, responseType: 'json' })).body;

export default defineExtension({
  preferences: () => [
    {
      type: 'text',
      key: 'pref_thumbnail_url',
      label: 'Thumbnail URL',
      description: 'Custom thumbnail image URL',
      default: DEFAULT_THUMBNAIL,
    },
  ],

  createSource: (info: SourceInfo) => {
    const lang = info.lang;
    const thumbnail = () => prefs.get<string>('pref_thumbnail_url')?.trim() || DEFAULT_THUMBNAIL;

    const fansubs = async (): Promise<MangaPage> => {
      const result = await getJson<Record<string, { path: string; title: string }[]>>(
        `${BASE_URL}/fansubs-config.json`,
      );
      return {
        items: (result[lang] ?? []).map((f) => ({
          url: `/${f.path}`,
          title: `One Piece (${f.title})`,
          thumbnailUrl: thumbnail(),
        })),
        hasNextPage: false,
      };
    };

    return {
      baseUrl: BASE_URL,

      getPopular: fansubs,

      search: fansubs,

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        return {
          url: manga.url,
          title: manga.title,
          thumbnailUrl: manga.thumbnailUrl ?? thumbnail(),
          status: 'ongoing',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const numbers = await getJson<string[]>(`${BASE_URL}/server.php?lang=${lang}&folderName=${manga.url.slice(1)}`);
        const prefix = lang === 'es' ? 'Capítulo' : 'Chapter';
        return numbers.map((number) => ({
          url: `${manga.url}/${number}`,
          name: `${prefix} ${number}`,
          number: Number.parseFloat(number) || undefined,
        }));
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const [folderName, chapterNumber] = chapter.url.split('/').filter(Boolean) as [string, string];
        const images = await getJson<string[]>(
          `${BASE_URL}/server.php?lang=${lang}&folderName=${folderName}&chapter=${chapterNumber}`,
        );
        return images.map((fileName, index) => ({
          index,
          imageUrl: `${BASE_URL}/mangafiles/${lang}/${folderName}/${chapterNumber}/${fileName}`,
        }));
      },

      imageHeaders: () => headers,

      getWebUrl: (item: MangaSummary | Chapter) => `${BASE_URL}/manga/${lang}${item.url}`,
    };
  },
});
