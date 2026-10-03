import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://www.mangatown.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('li:has(a.manga_cover)').flatMap((li): MangaSummary[] => {
    const link = li.selectFirst('p.title a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: li.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  const next = document
    .select('div.next-page a.next, .page-nav a')
    .some(
      (a) =>
        !(a.attr('href') ?? '').startsWith('javascript') &&
        (a.attr('class')?.includes('next') || /next/i.test(a.text())),
    );
  return { items, hasNextPage: next };
}

function chapterDate(text: string): number | undefined {
  if (text.includes('Today')) return Date.now();
  if (text.includes('Yesterday')) return Date.now() - 86_400_000;
  return parseDate(text, 'MMM dd,yyyy');
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/directory/0-0-0-0-0-0/${page}.htm`),
    getLatest: (page) => list(`/latest/${page}.htm`),
    search: (query, page) => list(`/search?page=${page}&name=${encodeURIComponent(query.trim())}`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('div.article_content') ?? document;
      const field = (label: string) =>
        selectIgnoreCase(info, `li:has(b:contains(${label})) a`)
          .map((a) => a.text())
          .join(', ') || undefined;
      const statusText = selectIgnoreCase(info, 'li:has(b:contains(status))')[0]?.text().toLowerCase() ?? '';
      return {
        url: manga.url,
        title: info.selectFirst('h1')?.text() || manga.title,
        author: field('author'),
        artist: field('artist'),
        genres: field('genre')?.split(', '),
        status: statusText.includes('ongoing') ? 'ongoing' : statusText.includes('completed') ? 'completed' : 'unknown',
        description: document.selectFirst('span#show')?.text().replace(/HIDE$/, '').trim() || undefined,
        thumbnailUrl: document.selectFirst('div.detail_info img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('ul.chapter_list li').flatMap((li): Chapter[] => {
        const link = li.selectFirst('a');
        if (!link) return [];
        const extra = li
          .select('span:not(.time):not(.new)')
          .map((s) => s.text())
          .join(' ');
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: `${link.text()} ${extra}`.trim(),
            uploadedAt: chapterDate(
              li
                .select('span.time')
                .map((s) => s.text())
                .join(' '),
            ),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      const options = document
        .select('select#top_chapter_list ~ div.page_select option')
        .filter((o) => !o.text().includes('featured'));
      if (options.length > 0)
        return options.map((o, index) => ({ index, url: o.absUrl('value') || o.attr('value') || '' }));
      return document
        .select('div#viewer img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    async getImageUrl(page: Page): Promise<string> {
      const img = (await load(page.url ?? '')).selectFirst('div#viewer img');
      return img?.absUrl('src') || img?.attr('src') || '';
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^m\./, 'www.') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
