// ComiciViewer, ported from keiyoushi/extensions-source lib-multisrc/comiciviewer. This directory is a template:
// every extension using the theme keeps an identical copy in src/comiciviewer/ (`node scripts/sync-multisrc.mjs`).
import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  ImageTransform,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Preference,
  Source,
  TileOp,
} from '@matane/extension-sdk';
import { imageSize } from './image';
import { USER_AGENT, absoluteUrl, hostOf } from './utils';

const RANKING_PATH = '/ranking/manga';
const SEARCH_PAGE_SIZE = 24;
const GRID = 4;
const SHOW_LOCKED_KEY = 'pref_show_locked_chapters';
const SHOW_CAMPAIGN_LOCKED_KEY = 'pref_show_campaign_locked_chapters';

interface SeriesSummary {
  id: string;
  name: string;
  description?: string | null;
  author?: { name: string }[] | null;
  images?: { url: string }[] | null;
  tag?: { name: string }[] | null;
  isCompleted?: boolean | null;
}
interface Episode {
  id: string;
  title: string;
  datePublished?: number | null;
}
interface EpisodeAccess {
  episodeId: string;
  hasAccess: boolean;
  accessType: string;
}
interface DescriptionChild {
  text?: string | null;
  url?: string | null;
  children?: DescriptionChild[] | null;
}
interface EpisodeContent {
  type: string;
  viewerId?: string | null;
  url?: string | null;
}

function resolveText(node: DescriptionChild): string {
  if (node.text != null) return node.text;
  if (!node.children) return '';
  const inner = node.children.map(resolveText).join('');
  return node.url ? `[${inner}](${node.url})` : inner;
}

/** Rows of an `rsc: 1` response (`<id>:<json>`), parsed, by id. */
function rscRows(body: string): Map<string, unknown> {
  const rows = new Map<string, unknown>();
  for (const line of body.split('\n')) {
    const match = /^([0-9a-f]+):([[{].*)$/.exec(line);
    if (!match) continue;
    try {
      rows.set(match[1]!, JSON.parse(match[2]!));
    } catch {
      // Not JSON: skip.
    }
  }
  return rows;
}

export abstract class ComiciViewer {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  get apiUrl(): string {
    return `${this.baseUrl}/api`;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': USER_AGENT, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  async api<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
      .join('&');
    const response = await http.get<T>(`${this.apiUrl}/${path}${query ? `?${query}` : ''}`, {
      headers: { ...this.headers(), Accept: 'application/json' },
      responseType: 'json',
    });
    return response.body;
  }

  /** Series links come as `/series/<hash>`, `/series/<hash>/new` or `/<magazine>/series/<hash>`. */
  seriesHash(href: string): string {
    const segments = href.split(/[?#]/)[0]!.split('/');
    const index = segments.indexOf('series');
    if (index === -1 || !segments[index + 1]) throw new Error(`Unrecognized series url: ${href}`);
    return segments[index + 1]!;
  }

  seriesUrl(hash: string): string {
    return `/series/${hash}`;
  }

  summary(series: SeriesSummary): MangaSummary {
    return { url: this.seriesUrl(series.id), title: series.name, thumbnailUrl: series.images?.[0]?.url };
  }

  async getPopular(): Promise<MangaPage> {
    const response = await http.get(`${this.baseUrl}${RANKING_PATH}`, {
      headers: { ...this.headers(), rsc: '1' },
    });
    const rows = rscRows(response.body);
    const resolve = (value: unknown, depth = 0): unknown => {
      if (depth > 40) return value;
      if (typeof value === 'string') {
        const ref = /^\$([0-9a-f]+)$/.exec(value);
        return ref && rows.has(ref[1]!) ? resolve(rows.get(ref[1]!), depth + 1) : value;
      }
      if (Array.isArray(value)) return value.map((child) => resolve(child, depth + 1));
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolve(child, depth + 1)]));
      return value;
    };
    const find = (
      value: unknown,
      test: (obj: Record<string, unknown>) => boolean,
    ): Record<string, unknown> | undefined => {
      if (!value || typeof value !== 'object') return undefined;
      if (!Array.isArray(value) && test(value as Record<string, unknown>)) return value as Record<string, unknown>;
      for (const child of Array.isArray(value) ? value : Object.values(value)) {
        const found = find(child, test);
        if (found) return found;
      }
      return undefined;
    };
    let list: Record<string, unknown> | undefined;
    for (const row of rows.values()) {
      list = find(row, (obj) => obj.className === 'series-list mode-ranking');
      if (list) break;
    }
    const items: MangaSummary[] = [];
    if (list) {
      for (const entry of resolve(list.children) as unknown[]) {
        const link = find(entry, (obj) => String(obj.className ?? '').includes('series-list-item-link'));
        const title = find(entry, (obj) => obj['data-e2e'] === 'sliTitle');
        const img = find(entry, (obj) => 'src' in obj && 'alt' in obj);
        if (!link || typeof link.href !== 'string') continue;
        const srcSet = typeof img?.srcSet === 'string' ? img.srcSet : undefined;
        items.push({
          url: this.seriesUrl(this.seriesHash(link.href)),
          title: typeof title?.children === 'string' ? title.children : String(img?.alt ?? ''),
          thumbnailUrl:
            srcSet?.split(', ').pop()?.split(' ')[0] ?? (typeof img?.src === 'string' ? img.src : undefined),
        });
      }
    }
    return { items, hasNextPage: false };
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.listPage(`${this.baseUrl}/series/list/up/${page}`);
  }

  async listPage(url: string): Promise<MangaPage> {
    const document = await this.fetchDocument(url);
    const items = document.select('div.series-list-item').flatMap((element): MangaSummary[] => {
      const href = element.selectFirst('a.series-list-item-link')?.attr('href');
      if (!href) return [];
      return [
        {
          url: this.seriesUrl(this.seriesHash(href)),
          title: element.selectFirst('div.series-list-item-h span[data-e2e=sliTitle]')?.text().trim() ?? '',
          thumbnailUrl: element.selectFirst('img.series-list-item-img')?.absUrl('src'),
        },
      ];
    });
    return { items, hasNextPage: document.selectFirst('a.g-pager-link.mode-active + a.g-pager-link') != null };
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    if (query.trim()) {
      const { searchResult } = await this.api<{
        searchResult: { series: { total: number; series: SeriesSummary[] } };
      }>('search', { q: query.trim(), page: String(page), size: String(SEARCH_PAGE_SIZE) });
      return {
        items: searchResult.series.series.map((s) => this.summary(s)),
        hasNextPage: searchResult.series.total > page * SEARCH_PAGE_SIZE,
      };
    }
    const path = typeof filters.category === 'string' && filters.category ? filters.category : RANKING_PATH;
    if (path === RANKING_PATH) return this.getPopular();
    return this.listPage(`${this.baseUrl}${path}/${page}`);
  }

  /** Extra category entries (`[label, path]`) of a site. */
  extraFilterOptions(): [string, string][] {
    return [];
  }

  filterOptions(): [string, string][] {
    return [
      ['ランキング', RANKING_PATH],
      ['更新順', '/series/list/up'],
      ['新作順', '/series/list/new'],
      ['読み切り', '/category/manga/oneShot'],
      ['完結', '/category/manga/complete'],
      ['月曜日', '/category/manga/day/1'],
      ['火曜日', '/category/manga/day/2'],
      ['水曜日', '/category/manga/day/3'],
      ['木曜日', '/category/manga/day/4'],
      ['金曜日', '/category/manga/day/5'],
      ['土曜日', '/category/manga/day/6'],
      ['日曜日', '/category/manga/day/7'],
      ['その他', '/category/manga/day/8'],
      ...this.extraFilterOptions(),
    ];
  }

  getFilters(): Filter[] {
    return [
      { type: 'header', label: 'The search query ignores the filter' },
      {
        type: 'select',
        id: 'category',
        label: 'Filter by',
        options: this.filterOptions().map(([label, value]) => ({ label, value })),
        default: RANKING_PATH,
      },
    ];
  }

  preferences(): Preference[] {
    return [
      { type: 'switch', key: SHOW_LOCKED_KEY, label: 'Show Locked Chapters', default: true },
      {
        type: 'switch',
        key: SHOW_CAMPAIGN_LOCKED_KEY,
        label: "Show 'Require Login' Chapters",
        description: 'Shows chapters that are free but require login.',
        default: true,
      },
    ];
  }

  async fetchSeries(hash: string) {
    const params = { seriesHash: hash, episodeFrom: '1', episodeTo: '9999' };
    return Promise.all([
      this.api<{ series: { summary: SeriesSummary; episodes?: Episode[] } }>('episodes', params),
      this.api<{ seriesAccess: { episodeAccesses: EpisodeAccess[] } }>('series/access', params),
    ]);
  }

  hashOf(manga: MangaSummary): string {
    return manga.url.replace(/^\/series\//, '').replace(/^.*\/series\//, '');
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const [{ series }] = await this.fetchSeries(this.hashOf(manga));
    const s = series.summary;
    const author = s.author?.map((a) => a.name).join(', ') || undefined;
    let description: string | undefined;
    if (s.description?.trim()) {
      try {
        const nodes = JSON.parse(s.description) as { children: DescriptionChild[] }[];
        description = nodes.map((node) => node.children.map(resolveText).join('')).join('\n');
      } catch {
        description = s.description;
      }
    }
    return {
      ...this.summary(s),
      author,
      artist: author,
      description,
      genres: s.tag?.map((t) => t.name),
      status: s.isCompleted ? 'completed' : 'ongoing',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const [{ series }, { seriesAccess }] = await this.fetchSeries(this.hashOf(manga));
    const accesses = new Map(seriesAccess.episodeAccesses.map((a) => [a.episodeId, a]));
    const showLocked = prefs.get<boolean>(SHOW_LOCKED_KEY) ?? true;
    const showCampaignLocked = prefs.get<boolean>(SHOW_CAMPAIGN_LOCKED_KEY) ?? true;
    const chapters: Chapter[] = [];
    for (const episode of series.episodes ?? []) {
      const access = accesses.get(episode.id);
      const locked = access != null && !access.hasAccess;
      const needsLogin = locked && access.accessType === 'memberOnlyFree';
      if (locked && !(needsLogin ? showCampaignLocked : showLocked)) continue;
      chapters.push({
        url: `/episodes/${episode.id}${needsLogin ? '#login' : ''}`,
        name: `${needsLogin ? '➡️ ' : locked ? '🔒 ' : ''}${episode.title}`,
        uploadedAt: episode.datePublished ? episode.datePublished * 1000 : undefined,
      });
    }
    return chapters.reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    if (chapter.url.endsWith('#login'))
      throw new Error('This chapter is free but you need to log in via WebView and refresh the entry.');
    const id = chapter.url.split('#')[0]!.replace(/^\/episodes\//, '');
    const { episode } = await this.api<{ episode: { content: EpisodeContent[]; contentId: number } }>(`episodes/${id}`);
    const viewerId = episode.content.find((c) => c.type === 'viewer')?.viewerId;
    if (!viewerId) {
      const images = episode.content.filter((c) => c.type === 'image' && c.url);
      if (images.length === 0) throw new Error('Log in via WebView and purchase this chapter to read.');
      return images.map((c, index) => ({ index, imageUrl: c.url! }));
    }
    const userId = await this.api<{ user?: { id: string } | null }>('user/info')
      .then((r) => r.user?.id)
      .catch(() => undefined);
    const common = { 'comici-viewer-id': viewerId, contentId: String(episode.contentId), 'user-id': userId };
    const first = await this.api<{ totalPages: number }>('book/contentsInfo', {
      ...common,
      'page-from': '0',
      'page-to': '0',
    });
    const all = await this.api<{ result: { imageUrl: string; scramble: string; sort: number }[] }>(
      'book/contentsInfo',
      { ...common, 'page-from': '0', 'page-to': String(first.totalPages) },
    );
    return all.result.map((p) => ({ index: p.sort, imageUrl: `${p.imageUrl}#scramble=${p.scramble}` }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  transformImage(page: Page, bytes: Uint8Array): ImageTransform {
    const fragment = (page.imageUrl ?? '').split('#')[1] ?? '';
    if (!fragment.startsWith('scramble=')) return {};
    const tiles = fragment
      .slice('scramble='.length)
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((n) => Number.parseInt(n.trim(), 10));
    const size = imageSize(bytes);
    if (!size || tiles.length === 0 || tiles.some(Number.isNaN)) return {};
    const [width, height] = size;
    const tw = Math.floor(width / GRID);
    const th = Math.floor(height / GRID);
    const ops: TileOp[] = tiles.map((source, dest) => ({
      sx: Math.floor(source / GRID) * tw,
      sy: (source % GRID) * th,
      w: tw,
      h: th,
      dx: Math.floor(dest / GRID) * tw,
      dy: (dest % GRID) * th,
    }));
    const gridW = tw * GRID;
    const gridH = th * GRID;
    if (gridW < width) ops.push({ sx: gridW, sy: 0, w: width - gridW, h: height, dx: gridW, dy: 0 });
    if (gridH < height) ops.push({ sx: 0, sy: gridH, w: gridW, h: height - gridH, dx: 0, dy: gridH });
    return { tiles: { width, height, ops } };
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^?#]*)?/i.exec(url.trim());
    if (!match || match[1]!.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const hash = /\/series\/([^/?#]+)/.exec(match[2] ?? '')?.[1];
    return hash ? { url: this.seriesUrl(hash), title: '' } : null;
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url.split('#')[0]!);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: () => this.getPopular(),
      getLatest: (page) => this.getLatest(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      transformImage: (page, bytes) => this.transformImage(page, bytes),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
