import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://hentaifantasy.it';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const TAGS: [number, string][] = [
  [56, 'Ahegao'],
  [28, 'Anal'],
  [12, 'Ashikoki'],
  [24, 'Bestiality'],
  [44, 'Bizzare'],
  [30, 'Bondage'],
  [33, 'Cheating'],
  [57, 'Chubby'],
  [39, 'Dark Skin'],
  [43, 'Demon Girl'],
  [38, 'Femdom'],
  [46, 'Forced'],
  [52, 'Full color'],
  [36, 'Furry'],
  [18, 'Futanari'],
  [34, 'Group'],
  [8, 'Guro'],
  [41, 'Harem'],
  [51, 'Housewife'],
  [11, 'Incest'],
  [20, 'Lolicon'],
  [55, 'Maid'],
  [31, 'Milf'],
  [15, 'Monster Girl'],
  [49, 'Nurse'],
  [25, 'Oppai'],
  [42, 'Paizuri'],
  [35, 'Pettanko'],
  [32, 'Pissing'],
  [53, 'Public'],
  [21, 'Rape'],
  [27, 'Schoolgirl'],
  [26, 'Shotacon'],
  [40, 'Stockings'],
  [47, 'Swimsuit'],
  [48, 'Tanlines'],
  [50, 'Teacher'],
  [23, 'Tentacle'],
  [45, 'Toys'],
  [29, 'Trap'],
  [54, 'Tsundere'],
  [59, 'Uncensored'],
  [19, 'Vanilla'],
  [58, 'Yandere'],
  [22, 'Yaoi'],
  [14, 'Yuri'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function nextPage(document: HtmlElement): boolean {
  return document.select('div.next > a.gbutton').some((a) => a.text().includes('»'));
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('article.element').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a.thumb');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: element.selectFirst('div.title > a')?.attr('title') ?? '',
        thumbnailUrl: element.selectFirst('img.cover')?.absUrl('src') || undefined,
      },
    ];
  });
  // The site lists a series once per recent chapter.
  return {
    items: items.filter((m, i) => items.findIndex((o) => o.url === m.url) === i),
    hasNextPage: nextPage(document),
  };
}

function chapterDate(date: string): number | undefined {
  if (date === 'Oggi') return Date.now();
  if (date === 'Ieri') return Date.now() - 86_400_000;
  return parseDate(date, 'yyyy.M.d');
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaList(await load(`/most_downloaded/${page}/`)),
    getLatest: async (page) => parseMangaList(await load(`/latest/${page}/`)),
    async search(query, page, filters): Promise<MangaPage> {
      const tags = TAGS.filter(([id]) => filters[`tag.${id}`] === true);
      if (tags.length === 0 && query.length < 3) throw new Error('Inserisci almeno tre caratteri');
      const body =
        tags.length === 0 ? `search=${encodeURIComponent(query)}` : tags.map(([id]) => `tag%5B%5D=${id}`).join('&');
      const path =
        tags.length === 0
          ? 'search'
          : tags.length === 1
            ? `tag/${tags[0]![1].toLowerCase().replace(/ /g, '_')}/${page}`
            : 'search_tags';
      const response = await http.post(`${BASE_URL}/${path}`, body, {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const document = html.load(response.body, { baseUrl: response.url });
      if (document.select('article.element').length > 0) return parseMangaList(document);
      const items = document.select('div.group').flatMap((element): MangaSummary[] => {
        const link = element.selectFirst('div.title > a');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: link.attr('title') ?? '',
            thumbnailUrl: element.selectFirst('img.preview')?.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: nextPage(document) };
    },
    getFilters: (): Filter[] => [
      {
        type: 'group',
        id: 'tags',
        label: 'Generi',
        filters: TAGS.map(([id, label]) => ({ type: 'checkbox', id: `tag.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const genres: string[] = [];
      let author: string | undefined;
      for (const row of document.select('div.meta-row')) {
        const key = row.selectFirst('div.meta-key')?.text();
        if (key === 'Autore') author = row.selectFirst('div.meta-val > a')?.text();
        else if (key === 'Genere' || key === 'Tipo')
          for (const a of row.select('div.meta-val > a')) genres.push(a.text());
      }
      return {
        url: manga.url,
        title: manga.title,
        author,
        description: document.selectFirst('div.desc-text')?.text() || undefined,
        genres: genres.length ? genres : undefined,
        status: 'unknown',
        thumbnailUrl: document.selectFirst('section.comic-hero img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('article.chapter-card').flatMap((element): Chapter[] => {
        const anchor = element.selectFirst('div.chapter-card__title > a');
        if (!anchor) return [];
        const meta = ownText(element.selectFirst('div.chapter-card__meta'));
        const date = meta.includes(', ') ? meta.slice(meta.lastIndexOf(', ') + 2).trim() : '';
        return [
          {
            url: relativeUrl(anchor.absUrl('href') || anchor.attr('href') || ''),
            name: anchor.text(),
            uploadedAt: date ? chapterDate(date) : undefined,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      return [...response.body.matchAll(/"url":"(.*?)"/g)].map((match, index) => ({
        index,
        imageUrl: match[1]!.replace(/\\\//g, '/'),
      }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
