import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.mangakawaii.fr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function parseMangaCards(document: HtmlElement): MangaSummary[] {
  return document.select('a.mk-card[href*="/manga/"]').flatMap((element): MangaSummary[] => {
    const img = element.selectFirst('img');
    const title = element.selectFirst('p.mk-display')?.text() || img?.attr('alt');
    if (!title?.trim()) return [];
    return [
      {
        title,
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        thumbnailUrl: img?.absUrl('src') || undefined,
      },
    ];
  });
}

function hasNextPage(document: HtmlElement, page: number): boolean {
  const next = new RegExp(`[?&]page=${page + 1}(?:[&#]|$)`);
  return document.select('nav[aria-label="Pagination"] a[href]').some((a) => next.test(a.attr('href') ?? ''));
}

async function list(path: string, page: number): Promise<MangaPage> {
  const { document } = await load(`${BASE_URL}${path}${path.includes('?') ? '&' : '?'}page=${page}`);
  return { items: parseMangaCards(document), hasNextPage: hasNextPage(document, page) };
}

function parseRelativeDate(text: string): number | undefined {
  const clean = text.trim().toLowerCase();
  if (clean.includes('instant')) return Date.now();
  const match = /il y a (\d+)\s*([a-zéû.]+)/.exec(clean);
  if (!match) return undefined;
  const value = Number(match[1]);
  const d = new Date();
  switch (match[2]!.replace(/\.+$/, '')) {
    case 's':
    case 'sec':
    case 'seconde':
    case 'secondes':
      d.setSeconds(d.getSeconds() - value);
      break;
    case 'min':
    case 'minute':
    case 'minutes':
      d.setMinutes(d.getMinutes() - value);
      break;
    case 'h':
    case 'heure':
    case 'heures':
      d.setHours(d.getHours() - value);
      break;
    case 'j':
    case 'jour':
    case 'jours':
      d.setDate(d.getDate() - value);
      break;
    case 'sem':
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
    case 'annee':
    case 'annees':
      d.setFullYear(d.getFullYear() - value);
      break;
    default:
      return undefined;
  }
  return d.getTime();
}

function parseChapterRows(rows: HtmlElement[], out: Chapter[]): void {
  for (const element of rows) {
    const link = element.selectFirst('a.ch-num');
    if (!link) continue;
    const name = link.text();
    const number = /Ch\.\s*(\d+)/.exec(name)?.[1];
    out.push({
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      name,
      number: number ? Number(number) : undefined,
      uploadedAt: parseRelativeDate(element.selectFirst('p')?.text() ?? ''),
    });
  }
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list('/mangas?sort=views', page),
    getLatest: (page) => list('/mangas?sort=last_updated&dir=desc', page),
    async search(query, page): Promise<MangaPage> {
      if (!query.trim()) return list('/mangas', page);
      return list(`/recherche?q=${encodeURIComponent(query)}`, page);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(`${BASE_URL}${manga.url}`);
      const details: MangaDetails = {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('img.shadow-2xl')?.absUrl('src') || undefined,
        description: document.selectFirst('[x-ref=desc]')?.text() || undefined,
        status: 'unknown',
      };

      // The authors come first, then a paintbrush icon, then the artists.
      const authors: string[] = [];
      const artists: string[] = [];
      const people = document.selectFirst('p:has(i.fa-pen-nib)')?.html() ?? '';
      let inArtists = false;
      for (const m of people.matchAll(/<i\b[^>]*class="[^"]*fa-paintbrush[^"]*"|<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
        if (m[1] === undefined) inArtists = true;
        else (inArtists ? artists : authors).push(decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim());
      }
      details.author = [...new Set(authors)].join(', ') || undefined;
      details.artist = [...new Set(artists)].join(', ') || undefined;
      details.genres = [...new Set(document.select('a[href*=genres]').map((a) => a.text()))];

      const info = document.select('details p');
      const status = info[0]?.text().split('·').pop()?.trim().toLowerCase();
      details.status = status === 'en cours' ? 'ongoing' : status === 'terminé' ? 'completed' : 'unknown';
      const altNames = info[1]?.text() ?? '';
      if (altNames) {
        details.description = `${details.description ? `${details.description}\n\n` : ''}Alternative Names: ${altNames}`;
      }
      return details;
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document, url } = await load(`${BASE_URL}${manga.url}`);
      const chaptersUrl =
        document.selectFirst('[data-url*=chapitres]')?.absUrl('data-url') ||
        `${url.replace(/[?#].*$/, '').replace(/\/+$/, '')}/chapitres`;
      const chapters: Chapter[] = [];
      parseChapterRows(document.select('div.ch-row'), chapters);
      for (let page = chapters.length === 0 ? 1 : 2; ; page++) {
        const rows = (await load(`${chaptersUrl}${chaptersUrl.includes('?') ? '&' : '?'}page=${page}`)).document.select(
          'div.ch-row',
        );
        if (rows.length === 0) break;
        parseChapterRows(rows, chapters);
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(`${BASE_URL}${chapter.url}`);
      let state = document.selectFirst('[x-data*=imgs]')?.attr('x-data') ?? '';
      let previous: string;
      do {
        previous = state;
        state = state
          .replace(/\\\\/g, '\\')
          .replace(/\\u0022/g, '"')
          .replace(/\\u0026/g, '&')
          .replace(/\\\//g, '/');
      } while (state !== previous);
      const imagesJson = /"imgs":\s*\[([\s\S]*?)\]/.exec(state)?.[1] ?? '';
      let urls: string[] = [];
      try {
        urls = [...new Set((JSON.parse(`[${imagesJson}]`) as string[]).filter((u) => !u.includes('__mk_trap__')))];
      } catch {
        // fall through to the markup
      }
      if (urls.length > 0) return urls.map((imageUrl, index) => ({ index, imageUrl }));
      return document
        .select('img[id^=pg-]')
        .map((img) => img.absUrl('src'))
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?mangakawaii\.fr\/manga\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/manga/${slug}`, title: '' } : null;
    },
  }),
});
