import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.darthsanddroids.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CAST = [
  'QuiGon',
  'Anakin2',
  'ObiWan3',
  'JarJar2',
  'Leia4',
  'Han5',
  'Luke6',
  'Cassian',
  'C3PO4',
  'Finn7',
  'Han4',
  'Hux8',
];
const DESCRIPTION =
  "What if Star Wars as we know it didn't exist, but instead the plot of the movies was being made up on the spot by players of a Tabletop Game?\n\n" +
  'Well, for one, the results might actually make a lot more sense, from an out-of-story point of view…';

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// The archive lists one finished "film" per row with its own archive page; the running one is the main archive.
async function films(): Promise<MangaDetails[]> {
  const rows = (await load('/archive.html')).select('div.text > table.text > tbody > tr');
  const films: MangaDetails[] = [];
  let title = 'Darths & Droids';
  const film = (url: string, status: MangaDetails['status']): MangaDetails => ({
    url,
    title,
    author: 'David Morgan-Mar & Co.',
    artist: 'David Morgan-Mar & Co.',
    description: DESCRIPTION,
    genres: ['Campaign Comic', 'Comedy', 'Space Opera', 'Science Fiction'],
    status,
    thumbnailUrl: `${BASE_URL}/cast/${CAST[films.length] ?? 'Vader4'}.jpg`,
  });
  for (const row of rows) {
    const header = row.selectFirst('th')?.text();
    if (header) {
      title = `Darths & Droids ${header}`;
      continue;
    }
    const archive = row.selectFirst('td[colspan="3"] > a');
    if (archive) films.push(film(relativeUrl(archive.absUrl('href') || archive.attr('href') || ''), 'completed'));
    else {
      films.push(film('/archive.html', 'ongoing'));
      break;
    }
  }
  return films;
}

const toPage = (list: MangaDetails[]): MangaPage => ({
  items: list.map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl })),
  hasNextPage: false,
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage(await films()),
    search: async (query) =>
      toPage((await films()).filter((f) => f.title.toLowerCase().includes(query.trim().toLowerCase()))),
    getMangaDetails: async (manga: MangaSummary) =>
      (await films()).find((f) => f.url === manga.url) ?? { ...manga, status: 'unknown' },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      // Pages without their own date get the archive's "Published:" date.
      const published = document
        .select('br + i')
        .map((i) => /Published:\s+\w+,\s+(\d+\s+\w+,\s+\d+)/.exec(i.text())?.[1])
        .find(Boolean);
      const fallback = parseDate(published, 'd MMMM, yyyy');
      const chapters: Chapter[] = [];
      for (const row of document.select('div.text > table.text > tbody > tr')) {
        const cells = row.select('td');
        const third = cells[2]?.selectFirst('a');
        if (third) {
          chapters.push({
            url: relativeUrl(third.absUrl('href') || third.attr('href') || ''),
            name: third.text(),
            number: chapters.length,
            uploadedAt: parseDate(cells[0]?.text().replace(/^\w+ /, ''), 'd MMM, yyyy'),
          });
        } else if (!cells.some((c) => c.attr('colspan'))) {
          const first = cells[0]?.selectFirst('a');
          if (first)
            chapters.push({
              url: relativeUrl(first.absUrl('href') || first.attr('href') || ''),
              name: first.text(),
              number: chapters.length,
              uploadedAt: fallback,
            });
        }
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('div.center img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]*archive[^?#]*\.html)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
