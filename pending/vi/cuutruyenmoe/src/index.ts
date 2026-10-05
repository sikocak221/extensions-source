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
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://cuutruyen.moe';
const PASSWORD_PREF = 'website_password';
const DEFAULT_PASSWORD = '5';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// The site sits behind a Livewire password page; unlocking it marks the session cookie, which is kept here.
let session = '';

function keepSession(responseHeaders: Record<string, string>): void {
  const setCookie = Object.entries(responseHeaders).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1];
  const cookie = /kuro_neko_session=[^;,\s]+/.exec(setCookie ?? '')?.[0];
  if (cookie) session = cookie;
}

async function unlock(body: string): Promise<void> {
  const data = /wire:initial-data="([^"]+)"/.exec(body)?.[1];
  const token = /livewire_token\s*=\s*'([^']+)'/.exec(body)?.[1];
  if (!data || !token) throw new Error('Không tìm thấy trang nhập mật khẩu');
  const wire = JSON.parse(decodeEntities(data)) as { fingerprint: unknown; serverMemo: unknown };
  const password = prefs.get<string>(PASSWORD_PREF)?.trim() || DEFAULT_PASSWORD;
  const response = await http.post(
    `${BASE_URL}/livewire/message/enter-secret`,
    {
      json: {
        fingerprint: wire.fingerprint,
        serverMemo: wire.serverMemo,
        updates: [
          { type: 'syncInput', payload: { id: 's1', name: 'password', value: password } },
          { type: 'callMethod', payload: { id: 'c1', method: 'submit', params: [] } },
        ],
      },
    },
    {
      headers: {
        ...headers,
        'X-CSRF-TOKEN': token,
        'X-Livewire': 'true',
        Accept: 'text/html, application/xhtml+xml',
        ...(session ? { Cookie: session } : {}),
      },
    },
  );
  keepSession(response.headers);
}

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const get = async (suffix = '') => {
    const response = await http.get(absoluteUrl(BASE_URL, url) + suffix, {
      headers: session ? { ...headers, Cookie: session } : headers,
    });
    keepSession(response.headers);
    return response;
  };
  let response = await get();
  if (response.body.includes('wire:initial-data') && response.body.includes('enter-secret')) {
    await unlock(response.body);
    // A distinct url, so a request cache (or recorded fixtures) doesn't hand back the password page.
    response = await get(`${url.includes('?') ? '&' : '?'}unlocked=1`);
  }
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const background = (element: HtmlElement | null | undefined) =>
  /background-image:\s*url\(['"]?(.*?)['"]?\)/.exec(element?.attr('style') ?? '')?.[1] || undefined;

async function mangaPage(path: string): Promise<MangaPage> {
  const { document, url } = await load(path);
  const items = document.select('div.manga-vertical').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('div.p-2 a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') ?? ''),
        title: link.text(),
        thumbnailUrl: background(card.selectFirst('div.cover')),
      },
    ];
  });
  const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
  return { items, hasNextPage: document.selectFirst(`a[href*="page=${page + 1}"]`) !== null };
}

export default defineExtension({
  preferences: () => [
    {
      type: 'text',
      key: PASSWORD_PREF,
      label: 'Mật khẩu truy cập website',
      description: `Mặc định: ${DEFAULT_PASSWORD}`,
      default: DEFAULT_PASSWORD,
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => mangaPage(`/tim-kiem?sort=-views&filter%5Bstatus%5D=2,1&page=${page}`),
    getLatest: (page) => mangaPage(`/tim-kiem?sort=-updated_at&filter%5Bstatus%5D=2,1&page=${page}`),
    async getFilters(): Promise<Filter[]> {
      const { document } = await load('/tim-kiem');
      const genres = new Map<string, string>();
      for (const label of document.select('label')) {
        const id = /^toggleGenre\('(\d+)'\)$/.exec(label.attr('@click') ?? '')?.[1];
        if (id && label.text().trim() && !genres.has(id)) genres.set(id, label.text().trim());
      }
      return [
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp',
          default: '-updated_at',
          options: [
            { label: 'Mới cập nhật', value: '-updated_at' },
            { label: 'Mới nhất', value: '-created_at' },
            { label: 'Cũ nhất', value: 'created_at' },
            { label: 'Xem nhiều', value: '-views' },
            { label: 'A-Z', value: 'name' },
            { label: 'Z-A', value: '-name' },
          ],
        },
        {
          type: 'select',
          id: 'status',
          label: 'Trạng thái',
          default: '2,1',
          options: [
            { label: 'Tất cả', value: '2,1' },
            { label: 'Đang tiến hành', value: '2' },
            { label: 'Đã hoàn thành', value: '1' },
          ],
        },
        ...(genres.size
          ? [
              {
                type: 'group' as const,
                id: 'genres',
                label: 'Thể loại',
                filters: [...genres].map(([id, label]): Filter => ({ type: 'checkbox', id: `genre.${id}`, label })),
              },
            ]
          : []),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      params.push(`sort=${encodeURIComponent(typeof filters.sort === 'string' ? filters.sort : '-updated_at')}`);
      if (typeof filters.status === 'string' && filters.status) params.push(`filter%5Bstatus%5D=${filters.status}`);
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice(6));
      if (genres.length) params.push(`filter%5Baccept_genres%5D=${genres.join(',')}`);
      if (query.trim()) params.push(`keyword=${encodeURIComponent(query.trim())}`);
      params.push(`page=${page}`);
      return mangaPage(`/tim-kiem?${params.join('&')}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const statusText =
        document.selectFirst('a[href*="filter[status]"] span, a[href*="filter%5Bstatus%5D"] span')?.text() ?? '';
      const status: MangaStatus = statusText.includes('Đã hoàn thành')
        ? 'completed'
        : statusText.includes('Đang tiến hành')
          ? 'ongoing'
          : 'unknown';
      const plot = document
        .selectFirst('div.mg-plot')
        ?.select('p')
        .slice(1)
        .map((p) => p.text());
      return {
        url: manga.url,
        title: document.selectFirst('span.grow.text-lg')?.text() || manga.title,
        author: document.selectFirst('a[href*="/tac-gia/"]')?.text() || undefined,
        genres: document.select('div.mt-2.flex.flex-wrap.gap-1 a[href*="/the-loai/"]').map((a) => a.text()),
        thumbnailUrl:
          background(document.selectFirst('div.cover-frame div.cover, div.cover-frame')) ?? manga.thumbnailUrl,
        description: plot?.join('\n').trim() || undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(manga.url);
      const seen = new Set<string>();
      return document.select('ul.overflow-y-auto a[href*="/truyen/"]').flatMap((a): Chapter[] => {
        const name = a.selectFirst('div.grow span.text-ellipsis, div.grow span.truncate')?.text().trim();
        const url = relativeUrl(a.absUrl('href') ?? '');
        if (!name || seen.has(url)) return [];
        seen.add(url);
        const datetime = a.selectFirst('span.timeago[datetime]')?.attr('datetime');
        // Vietnam time without an offset.
        const time = datetime ? Date.parse(`${datetime.replace(' ', 'T')}+07:00`) : Number.NaN;
        return [{ url, name, uploadedAt: Number.isNaN(time) ? undefined : time }];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      const urls = document
        .select('div.text-center > img.max-w-full')
        .map((img) => ['src', 'data-src', 'data-original', 'data-lazy-src'].map((a) => img.absUrl(a)).find(Boolean))
        .filter((u): u is string => Boolean(u));
      if (!urls.length) throw new Error('Could not find image data');
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/truyen/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
