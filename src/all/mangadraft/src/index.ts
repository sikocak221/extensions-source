import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://www.mangadraft.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface CatalogProject {
  name: string;
  avatar?: string | null;
  genres?: string | null;
  description?: string | null;
  url: string;
}

async function catalog(params: Record<string, string>): Promise<MangaPage> {
  const response = await http.get<{ data?: CatalogProject[] }>(
    withQuery(`${BASE_URL}/api/catalog/projects`, { ...params, number: '20' }),
    { headers, responseType: 'json' },
  );
  const data = response.body.data ?? [];
  return {
    items: data.map((it) => ({ url: relativeUrl(it.url), title: it.name, thumbnailUrl: it.avatar ?? undefined })),
    // if there is less than 20 received there won't be a next page
    hasNextPage: data.length >= 20,
  };
}

const option = (label: string, value: string) => ({ label, value });
const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  options: options.map(([l, v]) => option(l, v)),
});

function parseStatus(status: number | undefined): MangaStatus {
  return status === 0 ? 'ongoing' : status === 1 ? 'completed' : status === 2 ? 'hiatus' : 'unknown';
}

const value = (state: FilterState, id: string, fallback = '') =>
  typeof state[id] === 'string' ? (state[id] as string) : fallback;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page: number) => catalog({ order: 'popular', type: 'all', page: String(page) }),

    getLatest: (page: number) => catalog({ order: 'news', type: 'all', page: String(page) }),

    // Like the Tachiyomi source, the text query is not used (the catalogue has no text search).
    search(_query: string, page: number, state: FilterState): Promise<MangaPage> {
      return catalog({
        type: value(state, 'type', 'all'),
        order: value(state, 'order', 'all'),
        section: value(state, 'section'),
        genre: value(state, 'genre'),
        format: value(state, 'format'),
        language: value(state, 'language'),
        status: value(state, 'status'),
        order_all: value(state, 'sort', 'likes'),
        page: String(page),
      });
    },

    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Text search is not supported; sort is only applied when Order is All' },
        select('sort', 'Sort', [
          ['Likes', 'likes'],
          ['Comments', 'comments'],
          ['Views', 'views'],
          ['Name', 'name'],
        ]),
        select('type', 'Type', [
          ['All', 'all'],
          ['Manga-Comics', 'bd.manga'],
          ['Webtoons', 'webtoons'],
          ['Light Novels', 'novels'],
          ['ArtBooks', 'artbooks'],
        ]),
        select('order', 'Order', [
          ['All', 'all'],
          ['Popularity', 'popular'],
          ['Trending', 'trending'],
          ['Recently Released', 'news'],
        ]),
        select('section', 'Section', [
          ['All', ''],
          ['Neoville', 'neoville'],
          ['Original', 'original'],
          ['Indepolis', 'indepolis'],
          ['Recently Released', 'news'],
        ]),
        select('genre', 'Genre', [
          ['All', ''],
          ['Action', 'action'],
          ['Adventure', 'Adventure'],
          ['BL', 'boys-love-yaoi'],
          ['Drama', 'drama'],
          ['Geek', 'geek'],
          ['Yuri', 'girls-love-yuri'],
          ['Historic', 'historic'],
          ['Horror', 'horror'],
          ['Humor', 'humor'],
          ['Teens', 'teens'],
          ['Thriller', 'thriller'],
          ['Psychological', 'psychological'],
          ['Romance', 'romance'],
          ['Fantasy', 'fantasy'],
          ['Sport', 'sport'],
          ['Super-hero', 'super-hero'],
          ['Slice-of-life', 'slice-of-life'],
          ['Western', 'western'],
        ]),
        select('format', 'Format', [
          ['All', ''],
          ['Series', 'serie'],
          ['One-Shot', 'oneshot'],
        ]),
        select('language', 'Language', [
          ['All', ''],
          ['Deutsch', 'de'],
          ['English', 'en'],
          ['Spanish', 'es'],
          ['French', 'fr'],
          ['Italian', 'it'],
          ['Polski', 'pl'],
          ['Portuguese', 'pt'],
          ['Suomen kieli', 'fi'],
          ['Japanese', 'jp'],
        ]),
        select('status', 'Status', [
          ['All', ''],
          ['In Progress', '0'],
          ['Completed', '1'],
          ['On Break', '2'],
        ]),
      ];
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const script = document.select('script').find((s) => s.html().includes('window.project'));
      const json = /window\.project\s*=\s*(\{[\s\S]*?\})\s*;/.exec(script?.html() ?? '')?.[1];
      if (!json) throw new Error('Unable to find project script');
      const project = JSON.parse(json) as {
        name: string;
        description?: string;
        genres?: { name: string }[];
        project_status_id?: number;
      };
      return {
        url: manga.url,
        title: project.name,
        thumbnailUrl: manga.thumbnailUrl,
        description: project.description,
        author:
          document
            .select('[title=Auteur]')
            .map((e) => e.text())
            .join(' ') || undefined,
        artist:
          document
            .select('[title=créateur]')
            .map((e) => e.text())
            .join(' ') || undefined,
        genres: (project.genres ?? []).map((g) => g.name),
        status: parseStatus(project.project_status_id),
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const elements = document.select('a[href*="/reader/"]:not(:has(img))');
      const first = elements[0];
      if (!first) return [];
      if (!(first.attr('href') ?? '').includes('c.')) {
        // One-shot
        return [chapterFrom(first, 0)];
      }
      // The site lists oldest first; Matane wants newest first.
      return elements.map((el, i) => chapterFrom(el, i)).reverse();
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const url = `${BASE_URL}${chapter.url}`;
      let firstPage: string;
      if (chapter.url.includes('c.')) {
        // The reader redirects to the id of the first page of the chapter.
        const response = await http.get(url, { headers });
        firstPage = response.url.split(/[?#]/)[0]!.split('/').pop()!.replace(/\D/g, '');
      } else {
        firstPage = chapter.url.split('/').pop()!.replace(/\D/g, '');
      }
      const result = await http.get<Record<string, { id: number; number: number; url: string }[]>>(
        `${BASE_URL}/api/reader/listPages?first_page=${firstPage}&grouped_by_category=true`,
        { headers, responseType: 'json' },
      );
      const list = Object.values(result.body).find((pages) => pages.some((p) => String(p.id) === firstPage));
      if (!list) throw new Error('Pages not found');
      return list.map((p, index) => ({ index, imageUrl: `${p.url}?size=full` }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?mangadraft\.com(\/[^/?#]+\/[^/?#]+)\/?$/i.exec(url.trim());
      return match && !/^\/(reader|api|user)\//.test(match[1]!) ? { url: match[1]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function chapterFrom(element: HtmlElement, index: number): Chapter {
  const heading = element.selectFirst('h5');
  const dateText = (heading?.selectFirst('span') ?? element.selectFirst('div>span'))?.text().trim();
  let title = heading?.text() ?? '';
  if (dateText) title = title.split(dateText)[0]!;
  return {
    url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
    name: `${index}. ${title.trim()}`.trim(),
    number: index,
    uploadedAt: dateText ? parseDate(dateText, 'd MMMM yyyy') : undefined,
  };
}
