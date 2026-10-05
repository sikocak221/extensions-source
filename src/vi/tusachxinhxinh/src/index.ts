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
import { pbkdf2Sha512 } from './pbkdf2';

const BASE_URL = 'https://tusachxinhxinh12.online';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
// Chapter images are an AES-encrypted html blob; the passphrase is split in the reader script.
const KEY_PARTS = ['qX3xRL', 'guhD2Z', '9f7sWJ'] as const;

async function load(url: string): Promise<{ document: HtmlElement; body: string; url: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), body: response.body, url: response.url };
}

function lazyImage(img: HtmlElement | null | undefined): string | undefined {
  const lazy = img?.absUrl('data-lazy-src');
  const src = img?.absUrl('src');
  const url = lazy || (src && !src.startsWith('data:') ? src : '');
  return url ? url.replace(/-150x150(\.[a-zA-Z]+)$/, '$1') : undefined;
}

function listItems(document: HtmlElement, selector: string): MangaSummary[] {
  return document.select(selector).flatMap((li): MangaSummary[] => {
    const link = li.selectFirst('p.super-title a');
    return link
      ? [
          {
            url: relativeUrl(link.absUrl('href') ?? ''),
            title: link.text(),
            thumbnailUrl: lazyImage(li.selectFirst('img.list-left-img')),
          },
        ]
      : [];
  });
}

function latestPage(document: HtmlElement): MangaPage {
  const items = document.select('.col-md-3.col-xs-6.comic-item').flatMap((card): MangaSummary[] => {
    const href = card.selectFirst('a[href*="/truyen-tranh/"]')?.absUrl('href');
    const title = card.selectFirst('h3.comic-title')?.text();
    return href && title ? [{ url: relativeUrl(href), title, thumbnailUrl: lazyImage(card.selectFirst('img')) }] : [];
  });
  return { items, hasNextPage: document.selectFirst('ul.pager li.next:not(.disabled) a') !== null };
}

const latest = async (page: number) => latestPage((await load(page === 1 ? '/' : `/page/${page}/`)).document);

const FILTER_GROUPS: [string, string, string][] = [
  ['genre', 'Thể loại', '#nav-tags'],
  ['group', 'Nhóm', '#nav-teams'],
  ['series', 'Loạt Truyện', '#nav-series'],
  ['keyword', 'Từ khóa', '#nav-hashtags'],
];

async function decryptImages(body: string): Promise<string[] | undefined> {
  const blob = /var\s+htmlContent\s*=\s*"(.*?)"\s*;/s.exec(body)?.[1];
  if (!blob) return undefined;
  const payload = JSON.parse(blob.replace(/\\"/g, '"').replace(/\\\//g, '/')) as {
    ciphertext: string;
    iv: string;
    salt: string;
  };
  const hex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (b) => Number.parseInt(b, 16));
  const key = await pbkdf2Sha512(new Uint8Array(utf8.encode(KEY_PARTS.join(''))), hex(payload.salt), 999, 32);
  const plain = crypto.aesDecrypt(base64.decodeBytes(payload.ciphertext), key, { mode: 'cbc', iv: hex(payload.iv) });
  const fragment = html.load(utf8.decode(Array.from(plain)), { baseUrl: BASE_URL });
  return fragment.select('img').flatMap((img): string[] => {
    // Real urls sit in data-qx3xrl with '.', ':' and '/' swapped for the key parts.
    const hidden = img.attr(`data-${KEY_PARTS[0].toLowerCase()}`);
    if (hidden)
      return [hidden.split(KEY_PARTS[0]).join('.').split(KEY_PARTS[1]).join(':').split(KEY_PARTS[2]).join('/')];
    const src = img.absUrl('src');
    return src && src.startsWith('http') ? [src] : [];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const { document } = await load('/nhieu-xem-nhat/');
      return { items: listItems(document, 'ul.most-views.single-list-comic li.position-relative'), hasNextPage: false };
    },
    getLatest: latest,
    async getFilters(): Promise<Filter[]> {
      const { document } = await load('/');
      const filters: Filter[] = [{ type: 'header', label: 'Bộ lọc sẽ bị bỏ qua khi tìm kiếm' }];
      for (const [id, label, selector] of FILTER_GROUPS) {
        const options = new Map<string, string>();
        for (const a of document.select(`${selector} a[href]`)) {
          const path = relativeUrl(a.absUrl('href') ?? '');
          if (a.text().trim() && !options.has(path)) options.set(path, a.text().trim());
        }
        if (options.size) {
          filters.push({
            type: 'select',
            id,
            label,
            default: '',
            options: [{ label: 'Tất cả', value: '' }, ...[...options].map(([value, l]) => ({ label: l, value }))],
          });
        }
      }
      return filters;
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const response = await http.post<{ data: { title: string; link: string; img?: string | null }[] }>(
          `${BASE_URL}/wp-admin/admin-ajax.php`,
          { form: { action: 'searchtax', keyword: query.trim() } },
          { headers, responseType: 'json' },
        );
        const seen = new Set<string>();
        const items = response.body.data
          .filter((r) => r.link.includes('/truyen-tranh/'))
          .map((r) => ({
            url: relativeUrl(r.link),
            title: r.title,
            thumbnailUrl: r.img?.replace(/-150x150(\.[a-zA-Z]+)$/, '$1'),
          }))
          .filter((m) => !seen.has(m.url) && Boolean(seen.add(m.url)));
        return { items, hasNextPage: false };
      }
      const path = FILTER_GROUPS.map(([id]) => filters[id]).find((v): v is string => typeof v === 'string' && v !== '');
      if (!path) return latest(page);
      const { document } = await load(path);
      const items = listItems(document, 'ul.single-list-comic li.position-relative');
      return items.length ? { items, hasNextPage: false } : latestPage(document);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const statusText = document.selectFirst('span.comic-stt')?.text().toLowerCase() ?? '';
      const status: MangaStatus = statusText.includes('đang tiến hành')
        ? 'ongoing'
        : statusText.includes('hoàn thành') || statusText.includes('trọn bộ')
          ? 'completed'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('h2.info-title')?.text() || manga.title,
        thumbnailUrl: lazyImage(document.selectFirst('div.col-sm-4 img.img-thumbnail')) ?? manga.thumbnailUrl,
        author: document.selectFirst('strong:contains("Tác giả") + span')?.text() || undefined,
        status,
        genres: document.select('a[href*="/the-loai/"]').map((a) => a.text()),
        description: document.selectFirst('div.text-justify')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(manga.url);
      return document.select('.table-scroll table tr').flatMap((row): Chapter[] => {
        const link = row.selectFirst('a.text-capitalize');
        if (!link) return [];
        const raw = link.text();
        const name = /Chap\s*\d+(\.\d+)?/i.exec(raw)?.[0]?.trim() ?? raw.split('–').pop()!.split('-').pop()!.trim();
        return [
          {
            url: relativeUrl(link.absUrl('href') ?? ''),
            name,
            uploadedAt: parseDate(row.selectFirst('td.hidden-xs.hidden-sm')?.text(), 'dd/MM/yy'),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document, body } = await load(chapter.url);
      const decrypted = await decryptImages(body).catch(() => undefined);
      let urls = decrypted ?? [];
      if (!urls.length) {
        let images = document.select('#view-chapter img');
        if (!images.length)
          images = document.select('.chapter-content img, .reading-content img, .content-chapter img');
        urls = images.map((img) => img.absUrl('data-src') || img.absUrl('src') || '').filter(Boolean);
      }
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/truyen-tranh\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
