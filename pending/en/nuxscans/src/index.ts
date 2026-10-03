import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://nuxscans-comics.blogspot.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// Blogger: force the desktop layout (m=0) and follow its JavaScript redirects.
async function load(url: string): Promise<HtmlElement> {
  let target = absoluteUrl(BASE_URL, url).replace(/([?&])m=1\b/, '$1m=0');
  for (let hop = 0; hop < 3; hop++) {
    const response = await http.get(target, { headers });
    const redirect = /window\.location\.replace\(['"]([^'"]+)['"]\)/.exec(response.body)?.[1];
    if (!redirect) return html.load(response.body, { baseUrl: response.url });
    target = absoluteUrl(BASE_URL, redirect).replace(/([?&])m=1\b/, '$1m=0');
  }
  throw new Error('Too many redirects');
}

async function list(url: string): Promise<MangaPage> {
  const items = (await load(url)).select('.index-post').flatMap((post): MangaSummary[] => {
    const a = post.selectFirst('.post-title a');
    if (!a) return [];
    const img = post.selectFirst('.post-thumb');
    return [
      {
        url: relativeUrl(a.attr('href') ?? ''),
        title: a.text(),
        thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => list('/'),
    search: (query) => list(`/search?q=${encodeURIComponent(query.trim())}`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const detail = (label: string) => selectIgnoreCase(document, `.post-details p:contains(${label})`)[0]?.text();
      const status = detail('Status:')?.toLowerCase() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('h1.post-title')?.text() || manga.title,
        description: document.selectFirst('.post-details h3:contains(Synopsis) + p')?.text() || undefined,
        thumbnailUrl: document.selectFirst('.post-thumbnail img')?.absUrl('src') || manga.thumbnailUrl,
        author: detail('Author:')?.split('Author:')[1]?.trim() || undefined,
        status: status.includes('ongoing')
          ? 'ongoing'
          : status.includes('completed')
            ? 'completed'
            : status.includes('dropped')
              ? 'cancelled'
              : 'unknown',
        genres: document.select('.post-tab-genre .post-genre a').map((a) => a.text()),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document
        .select('.row-chapters .list-item a')
        .map((a) => {
          const text = a.text();
          return {
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            name: /^\d+(\.\d+)?$/.test(text) ? `Chapter ${text}` : text,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('.post-body img, .holder img')
        .filter((img) => {
          const src = (img.absUrl('src') || '').toLowerCase();
          return (
            src && !/logo|footer|credit/.test(src) && !(img.attr('class') ?? '').split(/\s+/).includes('watermark')
          );
        })
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
