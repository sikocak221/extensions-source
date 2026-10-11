import { type Chapter, type MangaSummary, defineExtension } from '@matane/extension-sdk';

const UNIVERSE_URL = 'https://universe.leagueoflegends.com';
const MEEPS_URL = 'https://universe-meeps.leagueoflegends.com/v1';
const COMICS_URL = 'https://universe-comics.leagueoflegends.com/comics';
const HEADERS = {
  Origin: UNIVERSE_URL,
  Referer: `${UNIVERSE_URL}/`,
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
};

// app language -> the site's locale
const LOCALES: Record<string, string> = {
  en: 'en_us',
  de: 'de_de',
  es: 'es_es',
  fr: 'fr_fr',
  it: 'it_it',
  pl: 'pl_pl',
  el: 'el_gr',
  ro: 'ro_ro',
  hu: 'hu_hu',
  cs: 'cs_cz',
  'es-419': 'es_mx',
  'pt-BR': 'pt_br',
  ja: 'ja_jp',
  ru: 'ru_ru',
  tr: 'tr_tr',
  ko: 'ko_kr',
};

interface Comic {
  title?: string;
  subtitle?: string;
  index?: number;
  url?: string;
  description?: string;
  background?: { uri: string };
  'featured-champions'?: { name: string }[];
}
interface Hub {
  sections: { series: { data: Comic[] }; 'one-shots': { data: Comic[] } };
}
interface Pages {
  'staging-date': string;
  'desktop-pages': { uri: string }[][];
}

const slugOf = (comic: Comic): string => {
  if (!comic.url) throw new Error('Empty URL');
  return comic.url.split('/comic/').pop() ?? comic.url;
};
const clean = (text: string): string =>
  text
    .replace(/<\/p> /g, '</p>')
    .replace(/<\/p>/g, '\n')
    .replace(/<p>/g, '');

async function getJson<T>(url: string): Promise<T> {
  const response = await http.get<T>(url, { headers: HEADERS, responseType: 'json' });
  return response.body;
}

export default defineExtension({
  createSource: ({ lang }) => {
    const siteLang = LOCALES[lang] ?? 'en_us';

    async function listAll(): Promise<{ summary: MangaSummary; genre: string }[]> {
      const hub = await getJson<Hub>(`${MEEPS_URL}/${siteLang}/comics/index.json`);
      const comics = [...hub.sections.series.data, ...hub.sections['one-shots'].data];
      return comics.flatMap((comic) =>
        comic.title && comic.url
          ? [
              {
                summary: { url: `/${slugOf(comic)}`, title: comic.title, thumbnailUrl: comic.background?.uri },
                genre: comic.subtitle ?? comic['featured-champions']?.map((c) => c.name).join(', ') ?? '',
              },
            ]
          : [],
      );
    }

    const fetchPages = (path: string): Promise<Pages> => getJson<Pages>(`${COMICS_URL}/${siteLang}/${path}/index.json`);
    const fetchDate = async (path: string): Promise<number | undefined> => {
      const pages = await fetchPages(path);
      const time = Date.parse(pages['staging-date']);
      return Number.isNaN(time) ? undefined : time;
    };

    return {
      baseUrl: `${UNIVERSE_URL}/${siteLang}/comic/`,
      getPopular: async () => ({ items: (await listAll()).map((e) => e.summary), hasNextPage: false }),
      search: async (query) => {
        const q = query.toLowerCase();
        const all = await listAll();
        return {
          items: all
            .filter((e) => e.summary.title.toLowerCase().includes(q) || e.genre.toLowerCase().includes(q))
            .map((e) => e.summary),
          hasNextPage: false,
        };
      },
      getMangaDetails: async (manga) => {
        const entry = (await listAll()).find((e) => e.summary.url === manga.url);
        const hub = await getJson<Hub>(`${MEEPS_URL}/${siteLang}/comics/index.json`);
        const comic = [...hub.sections.series.data, ...hub.sections['one-shots'].data].find(
          (c) => c.url && `/${slugOf(c)}` === manga.url,
        );
        return {
          url: manga.url,
          title: entry?.summary.title ?? manga.title,
          thumbnailUrl: entry?.summary.thumbnailUrl ?? manga.thumbnailUrl,
          description: comic?.description ? clean(comic.description) : undefined,
          genres: entry?.genre ? entry.genre.split(', ') : undefined,
          status: 'unknown',
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const slug = manga.url.replace(/^\//, '');
        if (!slug.includes('/')) {
          const data = await getJson<{ issues: Comic[] }>(`${MEEPS_URL}/${siteLang}/comics/${slug}/index.json`);
          const issues = [...data.issues].reverse();
          return Promise.all(
            issues.map(async (issue): Promise<Chapter> => ({
              url: slugOf(issue),
              name: issue.title ?? slugOf(issue),
              number: issue.index ?? -1,
              uploadedAt: await fetchDate(slugOf(issue)).catch(() => undefined),
            })),
          );
        }
        return [
          {
            url: slug,
            name: 'One Shot',
            number: 0,
            uploadedAt: await fetchDate(slug).catch(() => undefined),
          },
        ];
      },
      getPages: async (chapter) => {
        const pages = await fetchPages(chapter.url);
        return pages['desktop-pages'].flat().map((image, index) => ({ index, imageUrl: image.uri }));
      },
      imageHeaders: () => HEADERS,
      getWebUrl: (item) => `${UNIVERSE_URL}/${siteLang}/comic/${item.url.replace(/^\//, '')}`,
    };
  },
});
