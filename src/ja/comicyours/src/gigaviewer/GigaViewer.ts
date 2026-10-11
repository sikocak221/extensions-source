// GigaViewer (https://hatena.co.jp/solutions/gigaviewer), ported from keiyoushi/extensions-source
// lib-multisrc/gigaviewer. This directory is a template: every extension using the theme keeps an identical copy in
// src/gigaviewer/ (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are the path of the first episode of the series, chapter urls
// "/<episode|volume>/<readable product id>".
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Preference,
  Source,
  TileOp,
  ImageTransform,
} from '@matane/extension-sdk';
import { imageSize } from './image';
import { USER_AGENT, hostOf, relativeUrl } from './utils';

export const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_locked',
  label: 'Hide Paid Chapters',
  default: false,
};
export const HIDE_UNAVAILABLE_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_unavailable',
  label: 'Hide Unavailable Chapters',
  default: false,
};

const DIVIDE_NUM = 4;
const MULTIPLE_NUM = 8;

export interface SeriesListItem {
  databaseId: string;
  title: string;
  thumbnailUri?: string | null;
  firstEpisode?: { permalink: string } | null;
  firstVolume?: { permalink: string } | null;
  latestEpisode?: { publishedAt?: string | null } | null;
  latestVolume?: { thumbnailUri?: string | null } | null;
  likeCount: number;
}

interface SeriesDetails extends SeriesListItem {
  author?: { name: string } | null;
  description?: string | null;
  episodes: { totalCount: number };
  volumes: { totalCount: number };
}

export interface ReadableProduct {
  readable_product_id: string;
  title: string;
  display_open_at?: string | null;
  viewer_uri: string;
  purchase_info: { can_read: boolean; unavailable: boolean };
  status?: Record<string, unknown> | null;
}

const SERIES_LIST_ITEM_FRAGMENT = `
fragment SeriesListItem on Series {
  databaseId
  title
  thumbnailUri
  firstEpisode { permalink }
  firstVolume { permalink }
  latestEpisode { publishedAt }
  latestVolume { thumbnailUri }
  likeCount
}`;

const SERIES_LIST_FRAGMENT = `
fragment SeriesList on Node {
  ... on SerialGroup { series { edges { node { ...SeriesListItem } } } }
  ... on Genre { series { edges { node { ...SeriesListItem } } } }
}${SERIES_LIST_ITEM_FRAGMENT}`;

const SEARCH_QUERY = `
query Search($keyword: String!) {
  searchSeries(keyword: $keyword) { edges { node { ...SeriesListItem } } }
}${SERIES_LIST_ITEM_FRAGMENT}`;

const SERIES_QUERY = `
query Series($id: String!) {
  series(databaseId: $id) {
    databaseId
    title
    author { name }
    description
    thumbnailUri
    firstEpisode { permalink }
    firstVolume { permalink }
    latestVolume { thumbnailUri }
    episodes: readableProducts(types: [EPISODE], first: 0) { totalCount }
    volumes: readableProducts(types: [VOLUME], first: 0) { totalCount }
  }
}`;

function seriesListQuery(variables: string[]): string {
  const definitions = variables.map((v) => `$${v}: ID!`).join(', ');
  const nodes = variables.map((v) => `${v}: node(id: $${v}) { ...SeriesList }`).join(' ');
  return `query(${definitions}) { ${nodes} }\n${SERIES_LIST_FRAGMENT}`;
}

/** Path of an absolute url, without query and fragment. */
function pathOf(url: string): string {
  return /^(?:https?:)?\/\/[^/?#]+([^?#]*)/i.exec(url)?.[1] ?? url.split(/[?#]/)[0] ?? '';
}

export abstract class GigaViewer {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  supportsLatest = true;

  /**
   * Series lists shown in popular ordered by their likes, and in latest ordered by their newest episode.
   * Each entry is the database id of a serial group ("Genre:<id>" for a genre).
   */
  seriesListIds: string[] = [];

  /** Filter options, each a label and the series lists it shows. */
  filterOptions(): [string, string[]][] {
    return [];
  }

  get apiUrl(): string {
    return `${this.baseUrl}/graphql`;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  async graphQL<T>(query: string, variables: Record<string, string>): Promise<T> {
    const body = (
      await http.post<{ data?: T; errors?: { message?: string }[] }>(
        this.apiUrl,
        { json: { query, variables } },
        { headers: { ...this.headers(), Accept: 'application/json' }, responseType: 'json' },
      )
    ).body;
    if (body.errors?.length && !body.data) throw new Error(body.errors.map((e) => e.message).join('\n'));
    return body.data as T;
  }

  // Listing. Sites without likes show 0 for every series, so they keep the order of their lists.
  async getPopular(): Promise<MangaPage> {
    const list = await this.fetchSeriesList(this.seriesListIds);
    list.sort((a, b) => b.likeCount - a.likeCount);
    return { items: list.flatMap((s) => this.toSummary(s) ?? []), hasNextPage: false };
  }

  async getLatest(): Promise<MangaPage> {
    const list = await this.fetchSeriesList(this.seriesListIds);
    const published = (s: SeriesListItem) => Date.parse(s.latestEpisode?.publishedAt ?? '') || 0;
    list.sort((a, b) => published(b) - published(a));
    return { items: list.flatMap((s) => this.toSummary(s) ?? []), hasNextPage: false };
  }

  async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
    if (query.trim()) {
      const data = await this.graphQL<{ searchSeries: { edges: { node: SeriesListItem }[] } }>(SEARCH_QUERY, {
        keyword: query.trim(),
      });
      const nodes = data.searchSeries.edges.map((e) => e.node);
      // Volume-only series last (stable sort keeps the rest in order).
      nodes.sort((a, b) => Number(!a.firstEpisode) - Number(!b.firstEpisode));
      return { items: nodes.flatMap((s) => this.toSummary(s) ?? []), hasNextPage: false };
    }
    const options = this.filterOptions();
    const selected = typeof filters.collection === 'string' ? Number(filters.collection) : 0;
    const ids = options[selected]?.[1] ?? [];
    return { items: await this.fetchCollection(ids), hasNextPage: false };
  }

  async fetchCollection(ids: string[]): Promise<MangaSummary[]> {
    return (await this.fetchSeriesList(ids)).flatMap((s) => this.toSummary(s) ?? []);
  }

  async fetchSeriesList(ids: string[]): Promise<SeriesListItem[]> {
    if (ids.length === 0) return [];
    const variables: Record<string, string> = {};
    ids.forEach((id, i) => {
      variables[`id${i}`] = base64.encode(id.includes(':') ? id : `SerialGroup:${id}`);
    });
    const data = await this.graphQL<Record<string, { series: { edges: { node: SeriesListItem }[] } }>>(
      seriesListQuery(Object.keys(variables)),
      variables,
    );
    const seen = new Set<string>();
    return Object.values(data)
      .flatMap((node) => node.series.edges.map((e) => e.node))
      .filter((s) => !seen.has(s.databaseId) && seen.add(s.databaseId));
  }

  toSummary(s: SeriesListItem): MangaSummary | null {
    const permalink = (s.firstEpisode ?? s.firstVolume)?.permalink;
    if (!permalink) return null;
    return {
      url: pathOf(permalink),
      title: s.title,
      thumbnailUrl: s.thumbnailUri ?? s.latestVolume?.thumbnailUri ?? undefined,
    };
  }

  /** Url of an entry from a website list: the path of its episode (the series id is looked up from it). */
  setSeriesUrl(episodeUrl: string, _thumbnailUrl?: string | null): string {
    return pathOf(episodeUrl);
  }

  // Details and chapters
  async seriesIdOf(manga: MangaSummary): Promise<string> {
    const head = manga.url.split('#')[0] ?? '';
    // Old urls were the bare series id.
    if (!head.startsWith('/')) return head;
    const document = await this.fetchDocument(this.baseUrl + head);
    const id = document.selectFirst('script.js-valve')?.attr('data-giga_series');
    if (!id) throw new Error('Cannot find the series id');
    return id;
  }

  async fetchSeries(id: string): Promise<SeriesDetails> {
    return (await this.graphQL<{ series: SeriesDetails }>(SERIES_QUERY, { id })).series;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const series = await this.fetchSeries(await this.seriesIdOf(manga));
    const summary = this.toSummary(series);
    return {
      url: manga.url,
      title: series.title,
      author: series.author?.name,
      description: series.description ?? undefined,
      thumbnailUrl: summary?.thumbnailUrl ?? manga.thumbnailUrl,
      status: 'unknown',
    };
  }

  isUnavailable(product: ReadableProduct): boolean {
    return product.purchase_info.unavailable;
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const seriesId = await this.seriesIdOf(manga);
    const series = await this.fetchSeries(seriesId);
    const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) === true;
    const hideUnavailable = prefs.get<boolean>(HIDE_UNAVAILABLE_PREFERENCE.key) === true;
    const [episodes, volumes] = await Promise.all([
      this.fetchReadableProducts(seriesId, 'episode', series.episodes.totalCount),
      this.fetchReadableProducts(seriesId, 'volume', series.volumes.totalCount),
    ]);
    return [...episodes, ...volumes]
      .map((product) => ({ product, unavailable: this.isUnavailable(product) }))
      .filter(({ product, unavailable }) => {
        const locked = !product.purchase_info.can_read && !product.purchase_info.unavailable;
        return !((hideLocked && locked) || (hideUnavailable && unavailable));
      })
      .map(({ product, unavailable }) => this.toChapter(product, unavailable));
  }

  toChapter(product: ReadableProduct, unavailable: boolean): Chapter {
    const type = pathOf(product.viewer_uri).split('/').filter(Boolean)[0] ?? 'episode';
    const locked = !product.purchase_info.can_read && !product.purchase_info.unavailable;
    const prefix = unavailable ? '🔒 ' : locked ? '💴 ' : '';
    const date = product.display_open_at ? Date.parse(product.display_open_at) : Number.NaN;
    return {
      url: `/${type}/${product.readable_product_id}`,
      name: `${prefix}${type === 'volume' ? '(Volume) ' : ''}${product.title}`,
      uploadedAt: Number.isFinite(date) ? date : undefined,
    };
  }

  async fetchReadableProducts(seriesId: string, type: string, count: number): Promise<ReadableProduct[]> {
    const products: ReadableProduct[] = [];
    while (products.length < count) {
      const url = `${this.baseUrl}/api/viewer/pagination_readable_products?type=${type}&aggregate_id=${encodeURIComponent(seriesId)}&sort_order=desc&offset=${products.length}`;
      const result = (await http.get<ReadableProduct[]>(url, { headers: this.headers(), responseType: 'json' })).body;
      if (result.length === 0) break;
      products.push(...result);
    }
    return products;
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(`${this.baseUrl}${chapter.url}`);
    const value = document.selectFirst('script#episode-json')?.attr('data-value');
    const structure = value
      ? (
          JSON.parse(value) as {
            readableProduct: {
              pageStructure?: { pages: { src?: string | null; type?: string | null }[]; choJuGiga: string } | null;
            };
          }
        ).readableProduct.pageStructure
      : null;
    if (!structure || structure.pages.length === 0) {
      throw new Error('This chapter is either unavailable or must be purchased.');
    }
    const scrambled = structure.choJuGiga === 'baku';
    return structure.pages
      .filter((page) => page.type === 'main' && page.src)
      .map((page, index) => ({ index, imageUrl: scrambled ? `${page.src}#scramble` : page.src! }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  /** Unscrambles the pages of "baku" chapters (a 4x4 grid of blocks that swap rows and columns). */
  transformImage(page: Page, bytes: Uint8Array): ImageTransform {
    if (!(page.imageUrl ?? '').endsWith('#scramble')) return {};
    const size = imageSize(bytes);
    if (!size) return {};
    const [width, height] = size;
    const blockW = Math.floor(width / (DIVIDE_NUM * MULTIPLE_NUM)) * MULTIPLE_NUM;
    const blockH = Math.floor(height / (DIVIDE_NUM * MULTIPLE_NUM)) * MULTIPLE_NUM;
    const ops: TileOp[] = [];
    for (let e = 0; e < DIVIDE_NUM * DIVIDE_NUM; e++) {
      const dst = (e % DIVIDE_NUM) * DIVIDE_NUM + Math.floor(e / DIVIDE_NUM);
      ops.push({
        sx: (e % DIVIDE_NUM) * blockW,
        sy: Math.floor(e / DIVIDE_NUM) * blockH,
        w: blockW,
        h: blockH,
        dx: (dst % DIVIDE_NUM) * blockW,
        dy: Math.floor(dst / DIVIDE_NUM) * blockH,
      });
    }
    // The strips right of and below the grid are not scrambled.
    const gridW = blockW * DIVIDE_NUM;
    const gridH = blockH * DIVIDE_NUM;
    if (width > gridW) ops.push({ sx: gridW, sy: 0, w: width - gridW, h: height, dx: gridW, dy: 0 });
    if (height > gridH) ops.push({ sx: 0, sy: gridH, w: gridW, h: height - gridH, dx: 0, dy: gridH });
    return { tiles: { width, height, ops } };
  }

  // Filters
  getFilters(): Filter[] {
    const options: FilterOption[] = this.filterOptions().map(([label], i) => ({ label, value: String(i) }));
    return options.length > 0 ? [{ type: 'select', id: 'collection', label: 'コレクション', options }] : [];
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/(?:episode|volume)\/[^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    const path = item.url.includes('#') ? item.url.split('#')[1]! : item.url;
    return this.baseUrl + relativeUrl(path);
  }

  toSource(): Source {
    const source: Source = {
      baseUrl: this.baseUrl,
      getPopular: () => this.getPopular(),
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
    if (this.supportsLatest) source.getLatest = () => this.getLatest();
    return source;
  }
}
