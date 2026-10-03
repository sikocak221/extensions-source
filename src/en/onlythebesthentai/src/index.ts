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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://onlythebesthentai.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
// [filter id, label, site path, WordPress REST taxonomy]
const TAXONOMIES: [string, string, string, string][] = [
  ['tag', 'Tag', 'tag', 'tags'],
  ['parody', 'Parody', 'parody', 'categories'],
  ['character', 'Character', 'characters', 'characters'],
  ['artist', 'Artist', 'artist', 'artist'],
];

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  if (/One moment, please|wsidchk/.test(response.body.slice(0, 2000)))
    throw new Error('Bot protection detected. Open the website to solve the challenge.');
  return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
}

async function list(url: string): Promise<MangaPage> {
  const { document } = await load(url);
  const items = document.select('article.post').flatMap((post): MangaSummary[] => {
    const a = post.selectFirst('.blog-entry-title a, .entry-title a');
    if (!a) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: a
          .text()
          .replace(/\s*\[\d+]\s*$/, '')
          .trim(),
        thumbnailUrl: post.selectFirst('.nv-post-thumbnail-wrap img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a.next.page-numbers') != null };
}

const tags = (document: HtmlElement, label: string) =>
  document
    .select('.manga-tags-container')
    .filter((c) => (c.selectFirst('.manga-tags-label')?.text() ?? '').includes(label))
    .flatMap((c) => c.select('.tag-button').map((b) => b.text()));

// srcset: the widest candidate.
function bestImage(img: HtmlElement): string {
  const best = (img.attr('srcset') ?? '')
    .split(',')
    .map((entry) => entry.trim().split(/\s+/))
    .filter((parts) => parts[0])
    .sort((a, b) => (Number.parseInt(b[1] ?? '0', 10) || 0) - (Number.parseInt(a[1] ?? '0', 10) || 0))[0]?.[0];
  return best || img.absUrl('src') || '';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/${page > 1 ? `page/${page}/` : ''}`),
    search(query: string, page: number, filters: FilterState) {
      if (query.trim()) return list(`/?s=${encodeURIComponent(query.trim())}${page > 1 ? `&paged=${page}` : ''}`);
      const taxonomy = TAXONOMIES.find(([id]) => typeof filters[id] === 'string' && filters[id]);
      const base = taxonomy ? `/${taxonomy[2]}/${filters[taxonomy[0]]}/` : '/';
      return list(`${base}${page > 1 ? `page/${page}/` : ''}`);
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        { type: 'header', label: 'Only the first chosen filter is used; text search ignores them.' },
      ];
      for (const [id, label, , rest] of TAXONOMIES) {
        const entries: { name: string; slug: string; count?: number }[] = [];
        try {
          for (let page = 1, total = 1; page <= total && page <= 20; page++) {
            const response = await http.get<{ name: string; slug: string; count?: number }[]>(
              `${BASE_URL}/wp-json/wp/v2/${rest}?per_page=100&page=${page}`,
              { headers, responseType: 'json' },
            );
            total =
              Number(Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'x-wp-totalpages')?.[1]) || 1;
            entries.push(...response.body);
          }
        } catch (error) {
          log.warn(`Cannot load ${label} list`, error);
        }
        if (entries.length === 0) continue;
        entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        filters.push({
          type: 'select',
          id,
          label,
          options: [
            { label: 'Any', value: '' },
            ...entries.map((e) => ({ label: `${e.name} (${e.count ?? 0})`, value: e.slug })),
          ],
        });
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const lines: string[] = [];
      const parodies = tags(document, 'Parody');
      const characters = tags(document, 'Characters');
      if (parodies.length) lines.push(`Parody: ${parodies.join(', ')}`);
      if (characters.length) lines.push(`Characters: ${characters.join(', ')}`);
      const pages = document
        .select('.manga-tags-container')
        .find((c) => c.selectFirst('.manga-tags-label')?.text().startsWith('Pages'))
        ?.text()
        .replace(/\D/g, '');
      if (pages) lines.push(`Pages: ${pages}`);
      const body = document
        .selectFirst('.manga-info p')
        ?.text()
        .replace(/^Description:/, '')
        .trim();
      return {
        url: manga.url,
        title: document.selectFirst('h1.manga-title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('.manga-box .manga-img img')?.absUrl('src') || manga.thumbnailUrl,
        genres: tags(document, 'Tags'),
        author: tags(document, 'Artist').join(', ') || undefined,
        description: [lines.join('\n'), body].filter(Boolean).join('\n\n') || undefined,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { url, document } = await load(manga.url);
      const pages = document
        .select('.manga-tags-container')
        .find((c) => c.selectFirst('.manga-tags-label')?.text().startsWith('Pages'))
        ?.text()
        .replace(/\D/g, '');
      const time = Date.parse(document.selectFirst('meta[property="article:published_time"]')?.attr('content') ?? '');
      return [
        {
          url: relativeUrl(url),
          name: pages ? `Chapter [${pages} pages]` : 'Chapter',
          number: 1,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        },
      ];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      return document
        .select('.manga-gallery-wrapper figure.wp-block-image img')
        .map((img, index) => ({ index, imageUrl: bestImage(img) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
