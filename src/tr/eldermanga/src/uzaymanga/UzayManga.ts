// UzayManga, ported from keiyoushi/extensions-source lib-multisrc/uzaymanga (SvelteKit sites). This directory is a
// template: every extension using the theme keeps an identical copy in src/uzaymanga/
// (`node scripts/sync-multisrc.mjs`).
import type {
  Chapter,
  Filter,
  FilterOption,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './utils';

// The listing endpoint returns bogus currentPage/totalPages values, so the last page is detected by a short page.
const PAGE_SIZE = 20;

type Node = Record<string, unknown>;

/** Navigates SvelteKit's "devalue" data array: object properties are indices of other elements of the array. */
class SvelteData {
  constructor(private readonly array: unknown[]) {}

  object(index: number): Node | undefined {
    const value = this.array[index];
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : undefined;
  }

  list(index: number): unknown[] | undefined {
    const value = this.array[index];
    return Array.isArray(value) ? value : undefined;
  }

  string(index: number): string | undefined {
    const value = this.array[index];
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
  }

  int(index: number): number | undefined {
    const value = this.array[index];
    return typeof value === 'number' ? Math.trunc(value) : undefined;
  }

  private ref(node: Node, key: string): number | undefined {
    const value = node[key];
    return typeof value === 'number' ? value : undefined;
  }

  resolveObject(node: Node, key: string) {
    const ref = this.ref(node, key);
    return ref === undefined ? undefined : this.object(ref);
  }

  resolveArray(node: Node, key: string) {
    const ref = this.ref(node, key);
    return ref === undefined ? undefined : this.list(ref);
  }

  resolveString(node: Node, key: string) {
    const ref = this.ref(node, key);
    return ref === undefined ? undefined : this.string(ref);
  }

  resolveInt(node: Node, key: string) {
    const ref = this.ref(node, key);
    return ref === undefined ? undefined : this.int(ref);
  }

  resolveDate(node: Node, key: string): number | undefined {
    const value = this.resolveArray(node, key)?.[1];
    return typeof value === 'string' ? Date.parse(value) || undefined : undefined;
  }
}

const SORTS: FilterOption[] = [
  { label: 'En Yeni', value: 'new' },
  { label: 'En Popüler', value: 'popular' },
  { label: 'A-Z', value: 'name' },
  { label: 'Son Güncelleme', value: 'update' },
];
const STATUSES: FilterOption[] = [
  { label: 'Seçiniz...', value: '' },
  { label: 'Devam Ediyor', value: '1' },
  { label: 'Tamamlandı', value: '2' },
  { label: 'Durduruldu', value: '3' },
];
const COUNTRIES: FilterOption[] = [
  { label: 'Seçiniz...', value: '' },
  { label: 'Japonya', value: '1' },
  { label: 'Güney Kore', value: '2' },
  { label: 'Çin', value: '3' },
  { label: 'Diğer', value: '4' },
];
const CATEGORIES: FilterOption[] = [
  { label: 'Seçiniz...', value: '' },
  { label: 'Aksiyon', value: 'aksiyon' },
  { label: 'Avcı', value: 'avci' },
  { label: 'Bebek', value: 'bebek' },
  { label: 'Büyü', value: 'buyu' },
  { label: 'Canavar', value: 'canavar' },
  { label: 'Çete', value: 'cete' },
  { label: 'Cin', value: 'cin' },
  { label: 'Cin-serisi', value: 'cin-serisi' },
  { label: 'Doğaüstü', value: 'dogaustu' },
  { label: 'Doktor', value: 'doktor' },
  { label: 'Dövüş', value: 'dovus' },
  { label: 'Dövüş-sanatları', value: 'dovus-sanatlari' },
  { label: 'Dram', value: 'dram' },
  { label: 'Drama', value: 'drama' },
  { label: 'Ecchi', value: 'ecchi' },
  { label: 'Fantastik', value: 'fantastik' },
  { label: 'Fantezi', value: 'fantezi' },
  { label: 'Geçmişe-dönme', value: 'gecmise-donme' },
  { label: 'Geri-dönüş', value: 'geri-donus' },
  { label: 'Gizem', value: 'gizem' },
  { label: 'Harem', value: 'harem' },
  { label: 'Hayattan-kesitler', value: 'hayattan-kesitler' },
  { label: 'Intikam', value: 'intikam' },
  { label: 'Isekai', value: 'isekai' },
  { label: 'Komedi', value: 'komedi' },
  { label: 'Kule', value: 'kule' },
  { label: 'Macera', value: 'macera' },
  { label: 'Manhua', value: 'manhua' },
  { label: 'Manhwa', value: 'manhwa' },
  { label: 'Mature', value: 'mature' },
  { label: 'Murim', value: 'murim' },
  { label: 'Okul', value: 'okul' },
  { label: 'Okul-hayatı', value: 'okul-hayati' },
  { label: 'Oyun', value: 'oyun' },
  { label: 'Peri', value: 'peri' },
  { label: 'Reankarnasyon', value: 'reankarnasyon' },
  { label: 'Reankarne', value: 'reankarne' },
  { label: 'Romantik', value: 'romantik' },
  { label: 'Romantizm', value: 'romantizm' },
  { label: 'Sanal-gerçeklik', value: 'sanal-gerceklik' },
  { label: 'Sci-fi', value: 'sci-fi' },
  { label: 'Seinen', value: 'seinen' },
  { label: 'Şeytani', value: 'seytani' },
  { label: 'Shounen', value: 'shounen' },
  { label: 'Şiddet', value: 'siddet' },
  { label: 'Sistem', value: 'sistem' },
  { label: 'Spor', value: 'spor' },
  { label: 'Super-güç', value: 'super-guc' },
  { label: 'Tarihi', value: 'tarihi' },
  { label: 'Trajedi', value: 'trajedi' },
  { label: 'Uzay Manga', value: 'uzay-manga' },
  { label: 'Webtoon', value: 'webtoon' },
  { label: 'Yetişkin', value: 'yetiskin' },
  { label: 'Yıldız', value: 'yildiz' },
  { label: 'Zindan', value: 'zindan' },
  { label: 'Zindanlar', value: 'zindanlar' },
  { label: 'Zorbalar', value: 'zorbalar' },
];

export abstract class UzayManga {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  cdnUrl: string | null = null;
  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  /** The root object of a "__data.json" response and its devalue helper. */
  async fetchData(path: string): Promise<{ svelte: SvelteData; root: Node } | null> {
    const response = await http.get(absoluteUrl(this.baseUrl, path), { headers: this.headers() });
    const nodes = (JSON.parse(response.body) as { nodes?: { type: string; data?: unknown[] }[] }).nodes;
    const data = nodes?.filter((node) => node.type === 'data').pop()?.data;
    if (!data) return null;
    const svelte = new SvelteData(data);
    const root = svelte.object(0);
    return root ? { svelte, root } : null;
  }

  resolveImageUrl(imagePath: string): string {
    if (imagePath.startsWith('http')) return imagePath;
    const base = (this.cdnUrl ?? this.baseUrl).replace(/\/$/, '');
    return `${base}/${imagePath.replace(/^\//, '')}`;
  }

  toManga(svelte: SvelteData, series: Node): MangaSummary | null {
    const name = svelte.resolveString(series, 'name');
    const slug = svelte.resolveString(series, 'slug');
    if (!name || !slug) return null;
    return {
      url: `/manga/${slug}`,
      title: name,
      thumbnailUrl: this.resolveImageUrl(svelte.resolveString(series, 'image') ?? ''),
    };
  }

  toMangaList(svelte: SvelteData, indices: unknown[]): MangaSummary[] {
    return indices.flatMap((index) => {
      const series = typeof index === 'number' ? svelte.object(index) : undefined;
      const manga = series ? this.toManga(svelte, series) : null;
      return manga ? [manga] : [];
    });
  }

  // Popular
  getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { sort: 'popular' });
  }

  // Latest
  async getLatest(page: number): Promise<MangaPage> {
    const data = await this.fetchData(`/__data.json?page=${page}`);
    const lastEpisodes = data && data.svelte.resolveObject(data.root, 'lastEpisodes');
    const series = lastEpisodes && data.svelte.resolveArray(lastEpisodes, 'data');
    if (!data || !lastEpisodes || !series) return { items: [], hasNextPage: false };
    const currentPage = data.svelte.resolveInt(lastEpisodes, 'currentPage') ?? 1;
    const totalPages = data.svelte.resolveInt(lastEpisodes, 'totalPage') ?? 1;
    return { items: this.toMangaList(data.svelte, series), hasNextPage: currentPage < totalPages };
  }

  // Search
  async search(query: string, page: number, filters: Record<string, unknown>): Promise<MangaPage> {
    const params = [`page=${page}`, 'x-sveltekit-invalidated=001'];
    if (query.trim()) params.push(`search=${encodeURIComponent(query)}`);
    for (const key of ['category', 'status', 'country'] as const) {
      const value = filters[key];
      if (typeof value === 'string' && value) params.push(`${key}=${encodeURIComponent(value)}`);
    }
    params.push(`sort=${typeof filters.sort === 'string' && filters.sort ? filters.sort : 'new'}`);
    const data = await this.fetchData(`/manga/__data.json?${params.join('&')}`);
    const series = data && data.svelte.resolveArray(data.root, 'series');
    if (!data || !series) return { items: [], hasNextPage: false };
    return { items: this.toMangaList(data.svelte, series), hasNextPage: series.length === PAGE_SIZE };
  }

  getFilters(): Filter[] {
    return [
      { type: 'select', id: 'sort', label: 'Sıralama', options: SORTS },
      { type: 'select', id: 'category', label: 'Kategori', options: CATEGORIES },
      { type: 'select', id: 'status', label: 'Durum', options: STATUSES },
      { type: 'select', id: 'country', label: 'Ülke', options: COUNTRIES },
    ];
  }

  // Details and chapters come from the same data.
  async fetchSeries(manga: MangaSummary) {
    const data = await this.fetchData(`${manga.url}/__data.json?x-sveltekit-invalidated=001`);
    const series = data && data.svelte.resolveObject(data.root, 'series');
    return data && series ? { svelte: data.svelte, series } : null;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const found = await this.fetchSeries(manga);
    if (!found) return { ...manga, status: 'unknown' };
    const { svelte, series } = found;
    const summary = this.toManga(svelte, series) ?? manga;
    const statuses: Record<number, MangaStatus> = { 1: 'ongoing', 2: 'completed', 3: 'hiatus' };
    const genres = (svelte.resolveArray(series, 'resolvedCategories') ?? []).flatMap((index) => {
      const category = typeof index === 'number' ? svelte.object(index) : undefined;
      const title = category && svelte.resolveString(category, 'title');
      return title ? [title] : [];
    });
    return {
      ...summary,
      url: manga.url,
      description: svelte.resolveString(series, 'description'),
      status: statuses[svelte.resolveInt(series, 'status') ?? 0] ?? 'unknown',
      genres: genres.length > 0 ? genres : undefined,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const found = await this.fetchSeries(manga);
    if (!found) return [];
    const { svelte, series } = found;
    const slug = svelte.resolveString(series, 'slug');
    if (!slug) return [];
    return (svelte.resolveArray(series, 'SeriesEpisode') ?? []).flatMap((index): Chapter[] => {
      const chapter = typeof index === 'number' ? svelte.object(index) : undefined;
      const chapterSlug = chapter && svelte.resolveString(chapter, 'slug');
      if (!chapter || !chapterSlug) return [];
      const name = svelte.resolveString(chapter, 'name');
      const order = svelte.resolveString(chapter, 'order')?.replace(/\.0$/, '');
      let title = order ? `Bölüm ${order}` : '';
      if (name && name !== order) title += `${title ? ' - ' : ''}${name}`;
      return [
        {
          url: `/manga/${slug}/${chapterSlug}`,
          name: title || 'Bölüm',
          number: order && !Number.isNaN(Number(order)) ? Number(order) : undefined,
          uploadedAt: svelte.resolveDate(chapter, 'createdDate'),
        },
      ];
    });
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const data = await this.fetchData(`${chapter.url}/__data.json?x-sveltekit-invalidated=001`);
    const episode = data && data.svelte.resolveObject(data.root, 'episode');
    const images = episode && data.svelte.resolveArray(episode, 'images');
    if (!data || !images) return [];
    return images
      .flatMap((index) => {
        const path = typeof index === 'number' ? data.svelte.string(index) : undefined;
        return path ? [this.resolveImageUrl(path)] : [];
      })
      .map((imageUrl, i) => ({ index: i, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]!.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      getLatest: (page) => this.getLatest(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
