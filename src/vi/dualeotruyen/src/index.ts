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

const BASE_URL = 'https://dualeotruyenpet.com';
const DECRYPT_SALT = 'dualeo_salt_2025';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseList(document: HtmlElement): MangaPage {
  const items = document.select('.box_list .li_truyen').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a[href*=/truyen-tranh/]');
    if (!link) return [];
    const image = link.selectFirst('.img img');
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.selectFirst('.name')?.text() ?? '',
        thumbnailUrl: image?.absUrl('data-src') || image?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.pagination a.next') !== null };
}

/** The image file name is base64url, XOR-ed with a fixed salt. */
function decryptImageUrl(url: string): string | undefined {
  const slash = url.lastIndexOf('/');
  const dot = url.lastIndexOf('.');
  if (slash === -1 || dot === -1 || dot <= slash) return undefined;
  const encoded = url
    .slice(slash + 1, dot)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  let decoded: Uint8Array;
  try {
    decoded = base64.decodeBytes(encoded);
  } catch {
    return url;
  }
  const bytes = Array.from(decoded, (b, i) => b ^ DECRYPT_SALT.charCodeAt(i % DECRYPT_SALT.length));
  return `${url.slice(0, slash + 1)}${utf8.decode(bytes)}${url.slice(dot)}`;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseList(await load(`${BASE_URL}/truyen-tranh-hot?page=${page}`)),
    getLatest: async (page) => parseList(await load(`${BASE_URL}/truyen-moi-cap-nhat?page=${page}`)),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return parseList(await load(`${BASE_URL}/tim-kiem?key=${encodeURIComponent(query.trim())}`));
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : undefined;
      return parseList(
        await load(genre ? `${BASE_URL}${genre}?page=${page}` : `${BASE_URL}/truyen-tranh-hot?page=${page}`),
      );
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const document = await load(BASE_URL);
        const seen = new Set<string>();
        const genres = document.select('.main_menu .sub_menu a[href*=/the-loai/]').flatMap((a) => {
          const label = a.text();
          const value = relativeUrl(a.absUrl('href') || a.attr('href') || '');
          if (!label || seen.has(value)) return [];
          seen.add(value);
          return [{ label, value }];
        });
        return genres.length
          ? [
              { type: 'header', label: 'Lưu ý: Bộ lọc thể loại chỉ hoạt động khi ô tìm kiếm trống' },
              { type: 'select', id: 'genre', label: 'Thể loại', options: genres, default: genres[0]!.value },
            ]
          : [];
      } catch (error) {
        log.warn('Cannot load genres', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const statusText = document
        .select('.info-item')
        .find((e) => e.text().includes('Tình trang'))
        ?.text()
        .toLowerCase();
      const status: MangaStatus = statusText?.includes('hoàn thành')
        ? 'completed'
        : statusText?.includes('đang cập nhật')
          ? 'ongoing'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('.box_info_right h1')?.text() || manga.title,
        genres: document.select('.list-tag-story a').map((a) => a.text()),
        description: document.selectFirst('.story-detail-info')?.text() || undefined,
        status,
        thumbnailUrl: document.selectFirst('.box_info_left .img img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document.select('.chapter-item').flatMap((element): Chapter[] => {
        const link = element.selectFirst('.chap_name a');
        if (!link) return [];
        const date = parseDate(element.selectFirst('.chap_update')?.text(), 'dd/MM/yyyy');
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: link.text(),
            uploadedAt: date === undefined ? undefined : date - VIETNAM_OFFSET,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      const urls = document.select('.content_view_chap img').flatMap((img): string[] => {
        const encrypted = img.attr('data-img')?.trim();
        const src = img.absUrl('src') || '';
        if (encrypted) {
          const decrypted = decryptImageUrl(encrypted);
          return decrypted ? [decrypted] : [];
        }
        return src && !src.startsWith('data:') ? [src] : [];
      });
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen-tranh\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/truyen-tranh/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
