import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://hentaitnt.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const HIDE_VIP: Preference = { type: 'switch', key: 'hide_vip_chapters', label: 'Hide VIP chapters', default: false };
const GENRES = [
  'Action',
  'Adult',
  'BL',
  'Comedy',
  'Doujinshi',
  'Harem',
  'Horror',
  'Manga',
  'Manhwa',
  'Mature',
  'NTR',
  'Romance',
  'Uncensore',
  'Webtoon',
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('.comic-card a').map((a) => ({
    url: relativeUrl(a.attr('href') ?? ''),
    title: a.attr('title') ?? '',
    thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: document.selectFirst('a[title=Next]') != null };
}

const paged = (page: number) => (page > 1 ? `/page/${page}` : '');

export default defineExtension({
  preferences: () => [HIDE_VIP],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/recommended${paged(page)}`),
    getLatest: (page) => list(`/latest-updates${paged(page)}`),
    search(query: string, page: number, filters: FilterState) {
      if (query.trim()) return list(`${paged(page) || '/'}?s=${encodeURIComponent(query.trim())}`);
      const genre = typeof filters.genre === 'string' && filters.genre ? `/genre/${filters.genre}` : '';
      return list(`${genre}${paged(page)}` || '/');
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Ignored if using text search' },
      {
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [{ label: 'All', value: '' }, ...GENRES.map((g) => ({ label: g, value: g.toLowerCase() }))],
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const status = document.selectFirst('span:has(i[title=Status])')?.text().trim().toLowerCase();
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        author: document.selectFirst('i[title=Artists] + span a')?.text(),
        description: document.selectFirst('#synopsisText')?.text(),
        genres: document.select('.genre-item').map((e) => e.text()),
        status: status === 'completed' ? 'completed' : status === 'ongoing' ? 'ongoing' : 'unknown',
        thumbnailUrl: manga.thumbnailUrl,
      };
    },
    // Chapters come from the theme's ajax endpoint, keyed by the post id on the series page.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = (await load(manga.url)).selectFirst('#post_manga_id')?.attr('value');
      if (!id) throw new Error('Failed to get the manga id');
      const form = {
        action: 'baka_ajax',
        type: 'load_chapters_paginated',
        parent_id: id,
        per_page: '10000',
        order: 'newest_first',
      };
      const data = (
        await http.post<{ data: { html: string } }>(
          `${BASE_URL}/wp-admin/admin-ajax.php`,
          { form },
          { headers, responseType: 'json' },
        )
      ).body;
      const hideVip = prefs.get<boolean>(HIDE_VIP.key) === true;
      return html
        .load(data.data.html, { baseUrl: BASE_URL })
        .select('.comic-card')
        .flatMap((card): Chapter[] => {
          const link = card.selectFirst('a');
          const vip = card.selectFirst('.fa-crown') != null;
          if (!link || (vip && hideVip)) return [];
          return [
            {
              url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
              name: `${vip ? '🔒 ' : ''}${link.attr('title') ?? ''}`,
            },
          ];
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('.page-image')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
