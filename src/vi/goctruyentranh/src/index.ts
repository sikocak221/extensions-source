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
import { CHAPTER_COUNTS, COUNTRIES, GENRES, SORTS, STATUSES } from './filters';
import { relativeDateVi } from './vidate';

const BASE_URL = 'https://goctruyentranh.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

/** Covers through the site's Next.js image proxy (the originals refuse hotlinking). */
function thumbnail(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes('_next/image')) return url.replace(/([?&])w=\d+/, '$1w=384');
  return `${BASE_URL}/_next/image?url=${encodeURIComponent(url)}&w=384&q=75`;
}

function imageOf(img: HtmlElement | null | undefined): string | undefined {
  const src = img?.absUrl('src');
  if (src) return thumbnail(src);
  const first = img?.attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
  return first ? thumbnail(first.startsWith('http') ? first : BASE_URL + first) : undefined;
}

async function listing(path: string): Promise<MangaPage> {
  const document = await load(path);
  const items = document.select('section.mt-12 > .grid > .flex').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('a.line-clamp-2');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') ?? ''),
        title: link.text(),
        thumbnailUrl: imageOf(card.selectFirst('img')),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('nav ul li') !== null };
}

const group = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: options.map(([l, value]): Filter => ({ type: 'checkbox', id: `${id}.${value}`, label: l })),
});
const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]?.[1] ?? '',
  options: options.map(([l, value]) => ({ label: l, value })),
});

function statusOf(text: string | undefined): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (['đang tiến hành', 'đang cập nhật'].some((s) => value.includes(s))) return 'ongoing';
  if (['hoàn thành', 'đã hoàn thành'].some((s) => value.includes(s))) return 'completed';
  if (['tạm ngưng', 'tạm hoãn'].some((s) => value.includes(s))) return 'hiatus';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(`/danh-sach/truyen-hot?page=${page}`),
    getLatest: (page) => listing(`/danh-sach/truyen-moi-cap-nhat?page=${page}`),
    getFilters: (): Filter[] => [
      group('categories', 'Thể loại', GENRES),
      group('status', 'Trạng Thái', STATUSES),
      select('minChap', 'Độ dài', CHAPTER_COUNTS),
      select('sort', 'Sắp xếp', SORTS),
      group('country', 'Quốc gia', COUNTRIES),
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`keyword=${encodeURIComponent(query)}`, `page=${page}`];
      for (const [id, value] of Object.entries(filters)) {
        const dot = id.indexOf('.');
        if (dot > 0 && value === true) params.push(`${id.slice(0, dot)}=${encodeURIComponent(id.slice(dot + 1))}`);
      }
      for (const id of ['minChap', 'sort']) {
        const value =
          typeof filters[id] === 'string'
            ? (filters[id] as string)
            : id === 'minChap'
              ? CHAPTER_COUNTS[0]![1]
              : SORTS[0]![1];
        params.push(`${id}=${encodeURIComponent(value)}`);
      }
      const json = (
        await http.get<{
          comics: {
            current_page: number;
            last_page: number;
            data?: { name: string; slug: string; thumbnail?: string | null }[];
          };
        }>(`${BASE_URL}/baseapi/comics/filterComic?${params.join('&')}`, { headers, responseType: 'json' })
      ).body;
      return {
        items: (json.comics.data ?? []).map((c) => ({
          url: `/${c.slug}`,
          title: c.name,
          thumbnailUrl: thumbnail(c.thumbnail),
        })),
        hasNextPage: json.comics.current_page !== json.comics.last_page,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const description = document
        .select('div.mt-3')
        .map((container) => {
          const blocks = container.select('p');
          return blocks.length ? blocks.map((p) => p.text().trim()).join('\n\n') : container.text().trim();
        })
        .join('\n\n');
      return {
        url: manga.url,
        title: document.selectFirst('section aside:first-child h1')?.text() || manga.title,
        genres: document.select('span:contains("Thể loại:") ~ a').map((a) => a.text().replace(/^[,\s]+|[,\s]+$/g, '')),
        description: description || undefined,
        thumbnailUrl: imageOf(document.selectFirst('section aside:first-child img')) ?? manga.thumbnailUrl,
        status: statusOf(document.selectFirst('span:contains("Trạng thái:") + b')?.text()),
        author: document.selectFirst('span:contains("Tác giả:") + b')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('section ul li a').map((a) => {
        const date = a
          .select('.text-center')
          .map((e) => e.text())
          .join(' ')
          .trim();
        return {
          url: relativeUrl(a.absUrl('href') ?? ''),
          name:
            a
              .select('.items-center')
              .find((e) => e.text().includes('Chapter'))
              ?.text() ?? a.text(),
          uploadedAt: relativeDateVi(date) ?? parseDate(date, 'dd-MM-yyyy HH:mm:ss'),
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      // Pages go through db.goctruyentranh.net/v1/qq/images?src=<TruyenQQ cdn url>; the proxy is often
      // unreachable, while the cdn serves the same file with a TruyenQQ referer.
      return document.select('img.lozad').map((img, index) => {
        const url = img.absUrl('data-src') ?? '';
        const src = /\/v1\/qq\/images\?src=(.+)$/.exec(url)?.[1];
        return { index, imageUrl: src ? decodeURIComponent(src) : url };
      });
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: 'https://truyenqqgo.com/' }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
