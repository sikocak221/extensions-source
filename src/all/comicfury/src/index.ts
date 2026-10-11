import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://comicfury.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PREF_AUTHOR_NOTES = 'showAuthorsNotes';

const SORTS = ['Relevance', 'Popularity', 'Last Update'];
const LAST_UPDATED = ['All Time', 'This Week', 'This Month', 'This Year', 'Completed Only'];
const FLAGS: [id: string, label: string, param: string, options: string[]][] = [
  ['violence', 'Violence', 'fv', ['None / Minimal', 'Violent Content', 'Gore / Graphic']],
  ['nudity', 'Frontal Nudity', 'fn', ['None', 'Occasional', 'Frequent']],
  ['language', 'Strong Language', 'fl', ['None', 'Occasional', 'Frequent']],
  ['sexual', 'Sexual Content', 'fs', ['No Sexual Content', 'Sexual Situations', 'Strong Sexual Themes']],
];

const preferences: Preference[] = [
  {
    type: 'switch',
    key: PREF_AUTHOR_NOTES,
    label: "Show author's notes",
    description: "Not supported: author's notes need text rendering",
    default: false,
  },
];

const indexOptions = (list: string[]) => list.map((label, index) => ({ label, value: String(index) }));

/** GET that clicks through the "Content Warning" page like Tachiyomi's interceptor. */
async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string }> {
  let response = await http.get(url, { headers: HEADERS });
  let document = html.load(response.body, { baseUrl: response.url });
  const title = document.selectFirst('title')?.text() ?? '';
  if (title.includes('Content Warning') && document.selectFirst('input[name=proceed][value="View Webcomic"]')) {
    const token = document.selectFirst('input[name=token]')?.attr('value');
    if (token) {
      response = await http.post(response.url, { form: { token, proceed: 'View Webcomic' } }, { headers: HEADERS });
      document = html.load(response.body, { baseUrl: response.url });
    }
  }
  return { document, url: response.url };
}

function parseChapterDate(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const clean = text.replace(/(?<=\d)(st|nd|rd|th)|,/g, '').trim();
  if (clean.includes(':')) return parseDate(clean, 'd MMMM yyyy h:mm a') ?? parseDate(clean, 'MMMM d yyyy h:mm a');
  if (/^\d{1,2}\s?\w{3,9}\s?\w{2,4}$/.test(clean)) return parseDate(clean, 'd MMMM yyyy');
  if (/^\w{3,9}\s?\d{1,2}\s?\d{2,4}$/.test(clean)) return parseDate(clean, 'MMMM d yyyy');
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(clean)) return parseDate(clean, 'd.M.yyyy');
  return undefined;
}

export default defineExtension({
  preferences: () => preferences,
  createSource: ({ key, lang }) => {
    const siteLang = key === 'other-notext' ? 'notext' : lang === 'pt-BR' ? 'pt' : lang;

    async function searchPage(
      query: string,
      page: number,
      params: Record<string, string | undefined>,
    ): Promise<MangaPage> {
      const url = withQuery(`${BASE_URL}/search.php`, { query, page: String(page), language: siteLang, ...params });
      const { document } = await fetchDocument(url);
      const items = document.select('div.webcomic-result').map((result): MangaSummary => ({
        url: result.selectFirst('div.webcomic-result-avatar a')?.attr('href') ?? '',
        title: result.selectFirst('div.webcomic-result-title')?.attr('title') ?? '',
        thumbnailUrl: result.selectFirst('div.webcomic-result-avatar a img')?.absUrl('src'),
      }));
      return { items: items.filter((m) => m.url), hasNextPage: document.selectFirst('div.search-next-page') !== null };
    }

    const defaults = (sort: number): Record<string, string> => ({
      sort: String(sort),
      completed: '1',
      lastupdate: '0',
      fv: '2',
      fn: '2',
      fl: '2',
      fs: '2',
    });

    return {
      baseUrl: BASE_URL,
      getPopular: (page) => searchPage('', page, defaults(1)),
      getLatest: (page) => searchPage('', page, defaults(2)),
      search: (query, page, filters) => {
        const params = defaults(0);
        const str = (id: string): string | undefined =>
          typeof filters[id] === 'string' ? (filters[id] as string) : undefined;
        const tags = str('tags');
        if (tags !== undefined && tags.trim()) params.tags = tags.trim().replace(/, /g, ',');
        const sort = str('sort');
        if (sort) params.sort = sort;
        const lastupdate = str('lastupdate');
        if (lastupdate) params.lastupdate = lastupdate;
        // checked ("Comic Completed") => 0
        params.completed = filters.completed === true ? '0' : '1';
        for (const [id, , param] of FLAGS) {
          const value = str(id);
          if (value) params[param] = value;
        }
        return searchPage(query, page, params);
      },
      getFilters: (): Filter[] => [
        { type: 'text', id: 'tags', label: 'Tags' },
        { type: 'separator' },
        { type: 'select', id: 'sort', label: 'Sort By', options: indexOptions(SORTS), default: '0' },
        { type: 'separator' },
        { type: 'select', id: 'lastupdate', label: 'Last Updated', options: indexOptions(LAST_UPDATED), default: '0' },
        { type: 'checkbox', id: 'completed', label: 'Comic Completed' },
        { type: 'separator' },
        { type: 'header', label: 'Flags' },
        ...FLAGS.map(([id, label, , options]): Filter => ({
          type: 'select',
          id,
          label,
          options: indexOptions(options),
          default: '2',
        })),
      ],
      getMangaDetails: async (manga) => {
        const { document, url } = await fetchDocument(BASE_URL + manga.url);
        const tags = document.selectFirst('div.description-tags');
        const descriptionText =
          document
            .selectFirst('div.description-tags')
            ?.html()
            .replace(/<[^>]+>/g, '')
            .trim() ||
          document.selectFirst('meta[name=description]')?.attr('content') ||
          document.selectFirst('div.username-and-title em')?.text();
        const genres = tags
          ? tags
              .select('*')
              .filter((e) => e.text().trim())
              .map((e) => e.text())
          : document.select('div.authorinfo:contains(Genre) a').map((a) => a.text());
        return {
          url: relativeUrl(url),
          title: manga.title,
          thumbnailUrl: manga.thumbnailUrl,
          description: descriptionText || undefined,
          genres,
          author:
            document
              .select('a.authorname')
              .map((a) => a.text())
              .join(', ') || undefined,
          status: 'unknown',
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const slug = manga.url.split('?url=')[1] ?? manga.url.split('/').filter(Boolean).pop() ?? '';
        const archiveUrl = `${BASE_URL}/read/${slug}/archive`;
        const { document: archive, url: finalUrl } = await fetchDocument(archiveUrl);

        const toChapter = (element: HtmlElement, header?: string): Chapter => {
          const comicName = element
            .select('.archive-comic-title')
            .map((e) => e.text())
            .join(' ');
          return {
            url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
            name: header ? `${header} - ${comicName}` : comicName,
            uploadedAt: parseChapterDate(
              element
                .select('.archive-comic-date')
                .map((e) => e.text())
                .join(' '),
            ),
          };
        };

        async function collect(start: HtmlElement, header?: string): Promise<Chapter[]> {
          const chapters: Chapter[] = [];
          let current = start;
          for (let guard = 0; guard < 500; guard++) {
            chapters.push(...current.select('a:has(div.archive-comic)').map((e) => toChapter(e, header)));
            const next = current.selectFirst('span.vfpagecurrent + a.vfpage')?.absUrl('href');
            if (!next) break;
            current = (await fetchDocument(next)).document;
          }
          return chapters;
        }

        const chapters: Chapter[] = [];
        const archives = archive.select('a:has(div.archive-chapter)');
        if (archives.length > 0) {
          for (const element of archives) {
            const header =
              element
                .select('.archive-chapter-title')
                .map((e) => e.text())
                .join(' ') || element.text();
            const page = (await fetchDocument(element.absUrl('href') || element.attr('href') || '')).document;
            chapters.push(...(await collect(page, header)));
          }
        } else chapters.push(...(await collect(archive)));

        // Fallback when "Infinite Scroll View" is disabled by the author: the custom layout site.
        if (chapters.length === 0) {
          const parts = finalUrl
            .replace(/^https?:\/\/[^/]+/, '')
            .split('/')
            .filter(Boolean);
          const readIndex = parts.indexOf('read');
          const comicSlug = readIndex !== -1 ? (parts[readIndex + 1] ?? '') : '';
          if (comicSlug) {
            try {
              const custom = (await fetchDocument(`https://${comicSlug}.webcomic.ws/archive/comics`)).document;
              for (const element of custom.select('div.archivecomic, div.nl-archivecomic')) {
                const link = element.selectFirst('a');
                if (!link) continue;
                chapters.push({
                  url: link.absUrl('href') || link.attr('href') || '',
                  name: link.text(),
                  uploadedAt: parseChapterDate(element.selectFirst('.comicposttime, .nl-archivecomicposttime')?.text()),
                });
              }
            } catch {
              // ignore and return an empty list
            }
          }
        }
        return chapters.map((chapter, index) => ({ ...chapter, number: index })).reverse();
      },
      getPages: async (chapter): Promise<Page[]> => {
        const url = chapter.url.startsWith('http') ? chapter.url : BASE_URL + chapter.url;
        const { document, url: finalUrl } = await fetchDocument(url);
        const comic = document.selectFirst('div.is--comic-page');
        const images = comic ? comic.select('div.is--image-segment div img') : document.select('#comicimage');
        return images.map((img, index) => ({ index, url: finalUrl, imageUrl: img.attr('src') }));
      },
      imageHeaders: () => HEADERS,
      getWebUrl: (item) => {
        if ('name' in item) return item.url.startsWith('http') ? item.url : BASE_URL + item.url;
        return `${BASE_URL}/read/${item.url.split('?url=')[1] ?? ''}/archive`;
      },
    };
  },
});
