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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://lxmanga.org';
const headers = { 'User-Agent': USER_AGENT };

interface FilterOption {
  label: string;
  value: string;
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function pagedUrl(url: string, page: number): string {
  if (page <= 1) return url;
  const [path = '', query] = url.split('?');
  return `${path.replace(/\/+$/, '')}/page/${page}${query === undefined ? '' : `?${query}`}`;
}

/** Path (and query) of an absolute url. */
const pathAndQuery = (url: string) => url.replace(/^https?:\/\/[^/?#]+/i, '').replace(/#.*$/, '');

function parseMangaPage(document: HtmlElement, page: number): MangaPage {
  const seen = new Set<string>();
  const items = document.select('a.comic-link[href$=.html]').flatMap((link): MangaSummary[] => {
    const url = relativeUrl(link.absUrl('href') || link.attr('href') || '');
    if (seen.has(url)) return [];
    seen.add(url);
    // The cover is in the card that holds the title link: find it through the link's own card.
    const card = document
      .select('div.card')
      .find((c) => c.select('a.comic-link[href$=.html]').some((a) => relativeUrl(a.absUrl('href') || '') === url));
    const image = card?.selectFirst('a.comic-tmb img.card-img-top');
    return [{ url, title: link.text(), thumbnailUrl: image?.absUrl('data-src') || image?.absUrl('src') || undefined }];
  });
  return { items, hasNextPage: document.select(`a.page-link[data-page="${page + 1}"]`).length > 0 };
}

function detailLinks(document: HtmlElement, label: string): HtmlElement[] {
  const item = document
    .select('div.comic-details__item')
    .find((e) => e.selectFirst('.comic-details__label')?.text() === label);
  return item?.select('.comic-details__item_links a') ?? [];
}

const optionsFrom = (links: { label: string; value: string }[]): FilterOption[] => {
  const seen = new Set<string>();
  return links.filter((o) => o.label && !seen.has(o.value) && seen.add(o.value));
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaPage(await load(pagedUrl(`${BASE_URL}/truyen-tranh-hot`, page)), page),
    getLatest: async (page) => parseMangaPage(await load(pagedUrl(`${BASE_URL}/moi-cap-nhat`, page)), page),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let url: string;
      if (query.trim()) url = `${BASE_URL}/?s=${encodeURIComponent(query.trim())}`;
      else {
        const path = ['classification', 'genre', 'doujinshi', 'author']
          .map((id) => filters[id])
          .find((value) => typeof value === 'string' && value);
        url = `${BASE_URL}${path ?? '/moi-cap-nhat'}`;
      }
      return parseMangaPage(await load(pagedUrl(url, page)), page);
    },
    async getFilters(): Promise<Filter[]> {
      const sitemap = async (path: string, prefix: string): Promise<FilterOption[]> => {
        const response = await http.get(`${BASE_URL}${path}`, { headers });
        const doc = html.load(response.body, { xml: true });
        return optionsFrom(
          doc.select('loc').flatMap((loc) => {
            const p = pathAndQuery(loc.text().trim());
            if (!p.startsWith(prefix)) return [];
            const slug = decodeURIComponent(p.split('?')[0]!.replace(/\/+$/, '').split('/').pop() ?? '');
            return [{ label: slug.replace(/-/g, ' ').replace(/^./u, (c) => c.toUpperCase()), value: p }];
          }),
        );
      };
      const classifications = async (): Promise<FilterOption[]> => {
        const document = await load(BASE_URL);
        return optionsFrom(
          document.select('a[href]').flatMap((a) => {
            const path = pathAndQuery(a.absUrl('href') || a.attr('href') || '');
            const ok =
              path === '/moi-cap-nhat' ||
              path === '/truyen-tranh-hot' ||
              path === '/da-hoan-thanh' ||
              path.startsWith('/moi-cap-nhat?sort=') ||
              path.startsWith('/category/');
            return ok && a.text() ? [{ label: a.text(), value: path }] : [];
          }),
        );
      };
      const authors = async (): Promise<FilterOption[]> => {
        const document = await load(`${BASE_URL}/tac-gia`);
        return optionsFrom(
          document.select('div.channel-item__name_details a[href*="/artist/"]').map((a) => ({
            label: a.text(),
            value: pathAndQuery(a.absUrl('href') || a.attr('href') || ''),
          })),
        );
      };
      const safe = async (task: () => Promise<FilterOption[]>) => {
        try {
          return await task();
        } catch (error) {
          log.warn('Cannot load filter data', error);
          return [];
        }
      };
      const [cls, genres, doujinshi, artists] = await Promise.all([
        safe(classifications),
        safe(() => sitemap('/genre-sitemap.xml', '/genre/')),
        safe(() => sitemap('/doujinshi-sitemap.xml', '/doujinshi/')),
        safe(authors),
      ]);
      const select = (id: string, label: string, options: FilterOption[]): Filter[] =>
        options.length
          ? [{ type: 'select', id, label, options: [{ label: 'Tất cả', value: '' }, ...options], default: '' }]
          : [];
      return [
        { type: 'header', label: 'Bộ lọc bị bỏ qua khi nhập từ khóa tìm kiếm' },
        ...select('classification', 'Phân loại', cls),
        ...select('genre', 'Thể loại', genres),
        ...select('doujinshi', 'Doujinshi', doujinshi),
        ...select('author', 'Tác giả', artists),
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const metadata = [
        ...new Set(
          ['Danh mục', 'Thể loại', 'Quốc gia'].flatMap((label) => detailLinks(document, label).map((a) => a.text())),
        ),
      ];
      const statusText = document
        .select('h5')
        .map((e) => e.text())
        .join(' ')
        .toLowerCase();
      const status: MangaStatus = statusText.includes('đã hoàn thành')
        ? 'completed'
        : statusText.includes('đang tiến hành')
          ? 'ongoing'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('h1.comic-title')?.text() || manga.title,
        author:
          detailLinks(document, 'Tác giả')
            .map((a) => a.text())
            .join(', ') || undefined,
        genres: metadata,
        thumbnailUrl: document.selectFirst('img.img-thumbnail[alt]')?.absUrl('src') || manga.thumbnailUrl,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const mangaId =
        document.selectFirst('meta[name=post-id]')?.attr('content') ||
        /post_id["']?\s*:\s*["'](\d+)["']/.exec(response.body)?.[1];
      const nonce = document.selectFirst('#chapters_list_nonce')?.attr('value');
      if (!mangaId || !nonce) return [];
      const result = await http.post<{ data: { chapters: { title: string; link: string }[] } }>(
        `${BASE_URL}/wp-admin/admin-ajax.php`,
        {
          form: { action: 'baka_ajax', type: 'get_chapters_list', id: mangaId, chap: '0', chapters_list_nonce: nonce },
        },
        {
          headers: { ...headers, Referer: absoluteUrl(BASE_URL, manga.url), 'X-Requested-With': 'XMLHttpRequest' },
          responseType: 'json',
        },
      );
      return result.body.data.chapters.map((c): Chapter => ({ url: relativeUrl(c.link), name: c.title }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('img[alt^="Trang truyện"]')
        .map((element, index) => ({ index, imageUrl: element.absUrl('src') || element.attr('src') || '' }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+\.html)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
