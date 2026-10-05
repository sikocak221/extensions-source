import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.furyosociety.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const midnight = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
};

function parseRelative(date: string): number | undefined {
  const match = /il y a (\d+) (\p{L}+)/u.exec(date);
  if (!match) return undefined;
  const value = Number(match[1]);
  const d = new Date();
  d.setSeconds(0, 0);
  switch (match[2]) {
    case 'minute':
    case 'minutes':
      d.setMinutes(d.getMinutes() - value);
      break;
    case 'heure':
    case 'heures':
      d.setHours(d.getHours() - value);
      break;
    case 'jour':
    case 'jours':
      d.setDate(d.getDate() - value);
      break;
    case 'semaine':
    case 'semaines':
      d.setDate(d.getDate() - value * 7);
      break;
    case 'mois':
      d.setMonth(d.getMonth() - value);
      break;
    case 'an':
    case 'ans':
    case 'année':
    case 'années':
      d.setFullYear(d.getFullYear() - value);
      break;
    default:
      return undefined;
  }
  return d.getTime();
}

function parseChapterDate(date: string): number | undefined {
  const lower = date.toLowerCase();
  if (lower.startsWith('il y a')) return parseRelative(lower);
  if (lower.startsWith('avant-hier')) return midnight(-2);
  if (lower.startsWith('hier')) return midnight(-1);
  if (lower.startsWith("aujourd'hui")) return midnight(0);
  return parseDate(/le (.*)/.exec(date)?.[1] ?? date, 'd MMM yyyy');
}

const path = (url: string) => relativeUrl(url);

async function catalog(): Promise<MangaSummary[]> {
  const document = await load(`${BASE_URL}/mangas`);
  return document.select('div#fs-tous div.fs-card-body').flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('span.fs-comic-title a');
    const link = element.selectFirst('div.fs-card-img-container a')?.attr('href');
    if (!title || !link) return [];
    return [
      {
        url: path(link),
        title: title.text(),
        thumbnailUrl: element.selectFirst('div.fs-card-img-container img')?.absUrl('src') || undefined,
      },
    ];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: await catalog(), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const document = await load(BASE_URL);
      const seen = new Set<string>();
      const items = document.select('table.table-striped tr').flatMap((element): MangaSummary[] => {
        const title = element.selectFirst('span.fs-comic-title a');
        if (!title) return [];
        const url = path(title.attr('href') ?? '');
        if (seen.has(url)) return [];
        seen.add(url);
        return [
          {
            url,
            title: title.text(),
            thumbnailUrl: element.selectFirst('img.fs-chap-img')?.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: false };
    },
    async search(query): Promise<MangaPage> {
      const needle = query.toLowerCase();
      return { items: (await catalog()).filter((m) => m.title.toLowerCase().includes(needle)), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      const details: MangaDetails = {
        url: manga.url,
        title: document.selectFirst('h1.fs-comic-title')?.text() || manga.title,
        status: 'unknown',
      };
      const info = document.selectFirst('div.comic-info');
      if (!info) return details;
      // Each label <p> is followed by its value element.
      const labels = info.select('p.fs-comic-label');
      const values = info.select('p.fs-comic-label + *');
      labels.forEach((label, i) => {
        const value = values[i]?.text();
        switch (label.text().toLowerCase()) {
          case 'scénario':
            details.author = value;
            break;
          case 'dessins':
            details.artist = value;
            break;
          case 'genre':
            details.genres = value
              ?.split(',')
              .map((g) => g.trim())
              .filter(Boolean);
            break;
        }
      });
      details.description = info.selectFirst('div.fs-comic-description')?.text() || undefined;
      details.thumbnailUrl = info.selectFirst('img.comic-cover')?.absUrl('src') || undefined;
      return details;
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${BASE_URL}${manga.url}`);
      return document.select('div.fs-chapter-list div.element').flatMap((element): Chapter[] => {
        const title = element.selectFirst('div.title a');
        if (!title) return [];
        return [
          {
            url: path(title.attr('href') ?? ''),
            name: title.attr('title') ?? title.text(),
            uploadedAt: parseChapterDate(element.selectFirst('div.meta_r')?.text() ?? ''),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      return document.select('div.fs-read img[id]').map((img, index) => ({ index, imageUrl: img.absUrl('src') }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?furyosociety\.com\/(?:series|read)\/([^/?#]+)/i.exec(url);
      return match ? { url: `/series/${match[1]}/`, title: '' } : null;
    },
  }),
});
