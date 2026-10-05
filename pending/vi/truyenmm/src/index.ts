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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';
import { GENRES } from './genres';
import { relativeDateVi } from './vidate';

const BASE_URL = 'https://truyenmmhayr.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const imageOf = (img: HtmlElement | null | undefined) =>
  (img?.attr('data-src') ? img.absUrl('data-src') : img?.attr('src') ? img.absUrl('src') : undefined) || undefined;

/** Page number of a listing url: `?page=n` or a trailing `/n`. */
const pageOf = (url: string) => Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? /\/(\d+)\/?(?:[?#]|$)/.exec(url)?.[1] ?? 1);

async function listing(path: string): Promise<MangaPage> {
  const { document, url } = await load(path);
  const items = document.select('article').flatMap((article): MangaSummary[] => {
    const link = article.selectFirst('a[href^="/truyen/"]');
    const title = article.selectFirst('h2, h3')?.text();
    if (!link || !title) return [];
    return [{ url: relativeUrl(link.absUrl('href') ?? ''), title, thumbnailUrl: imageOf(article.selectFirst('img')) }];
  });
  const next = pageOf(url) + 1;
  const hasNextPage =
    document.selectFirst('link[rel=next]') !== null ||
    document.select('a[href]').some((a) => pageOf(a.absUrl('href') ?? '') === next);
  return { items, hasNextPage };
}

function infoValue(document: HtmlElement, label: string): string | undefined {
  return (
    document
      .select('dl > div')
      .find((div) => div.selectFirst('dt')?.text().toLowerCase().startsWith(label.toLowerCase()))
      ?.selectFirst('dd')
      ?.text() || undefined
  );
}

/** `slug-chapter-12` (topic api ids) → `/truyen/slug/chapter-12`. */
function chapterPath(id: string): string {
  const normalized = id.replace('-chapter-', '/chapter-');
  return `/truyen/${normalized}`;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(`/danh-sach-truyen/${page}`),
    getLatest: (page) => listing(`/truyen-moi-cap-nhat/${page}`),
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Khi tìm kiếm bộ lọc sẽ bị bỏ qua' },
      {
        type: 'select',
        id: 'genre',
        label: 'Thể loại',
        default: GENRES[0]?.[1] ?? '',
        options: GENRES.map(([label, value]) => ({ label, value })),
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return listing(`/tim-kiem?key=${encodeURIComponent(query.trim())}&page=${page}`);
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      return listing(genre ? `/the-loai/${genre}/${page}` : `/danh-sach-truyen/${page}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const statusText = infoValue(document, 'Loại Truyện')?.toLowerCase() ?? '';
      const status: MangaStatus = statusText.includes('hoàn thành')
        ? 'completed'
        : statusText.includes('đang tiến hành')
          ? 'ongoing'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: imageOf(document.selectFirst('img[alt*="Bìa"], img[alt*="bìa"]')) ?? manga.thumbnailUrl,
        author: infoValue(document, 'Tác giả'),
        status,
        genres: [...new Set(document.select('dd a[href*="/the-loai/"]').map((a) => a.text()))],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(manga.url);
      const topicId = document.selectFirst('script#script-chapter')?.attr('data-id');
      if (topicId) {
        const topic = await http
          .get<{ topic?: { chapters?: { name?: string; id?: string; update_time?: number }[] } }>(
            `${BASE_URL}/api/get-topic?id=${encodeURIComponent(topicId)}`,
            { headers, responseType: 'json' },
          )
          .then((r) => r.body.topic)
          .catch(() => undefined);
        if (topic?.chapters) {
          return topic.chapters.flatMap((c): Chapter[] =>
            c.id && c.name ? [{ url: chapterPath(c.id), name: c.name, uploadedAt: c.update_time || undefined }] : [],
          );
        }
      }
      return document.select('#chapter-list a[href*="/chapter-"]').map((a) => {
        const date = a.selectFirst('time')?.text().replace('🗓', '').trim();
        return {
          url: relativeUrl(a.absUrl('href') ?? ''),
          name: a.selectFirst('span')?.text() || a.text(),
          uploadedAt: relativeDateVi(date) ?? parseDate(date, 'dd/MM/yyyy'),
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      let images = document.select('div.w-full.flex.flex-col.items-center img');
      if (!images.length) images = document.select('img[data-src], img[src]');
      const urls = images
        .map(imageOf)
        .filter(
          (url): url is string =>
            Boolean(url) &&
            !url!.includes('/chapter-') &&
            !url!.endsWith('/loading.webp') &&
            !url!.endsWith('/page_logo.png'),
        );
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/truyen\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
