// MoonlightTL (the Moonlight Next.js reader with a JSON API), ported from keiyoushi/extensions-source
// lib-multisrc/moonlighttl. This directory is a template: every extension using the theme keeps an identical copy
// in src/moonlighttl/ (`node scripts/sync-multisrc.mjs`) and overrides members in a subclass.
//
// Manga urls are "/ver/<slug>", chapter urls "/ver/<slug>/<chapter slug>".
import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
  SortValue,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './utils';

const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    sort_by: 'Sort by',
    status: 'Status',
    sort_name: 'Name',
    sort_views: 'Views',
    sort_updated: 'Update',
    sort_created: 'Added',
    status_all: 'All',
    status_ongoing: 'Ongoing',
    status_hiatus: 'Hiatus',
    status_dropped: 'Dropped',
    status_completed: 'Completed',
    search_length_error: 'The search must have at least 2 characters',
    alternative_names: 'Alternative names',
    chapter: 'Chapter',
  },
  es: {
    sort_by: 'Ordenar por',
    status: 'Estado',
    sort_name: 'Nombre',
    sort_views: 'Vistas',
    sort_updated: 'Actualización',
    sort_created: 'Agregado',
    status_all: 'Todos',
    status_ongoing: 'En curso',
    status_hiatus: 'En pausa',
    status_dropped: 'Abandonado',
    status_completed: 'Finalizado',
    search_length_error: 'La búsqueda debe tener al menos 2 caracteres',
    alternative_names: 'Nombres alternativos',
    chapter: 'Capítulo',
  },
};

interface Named {
  name: string;
}

interface ChapterDto {
  num: number;
  name?: string | null;
  slug: string;
  created_at: string;
}

export interface SeriesDto {
  name: string;
  alternativeName?: string | null;
  slug: string;
  sinopsis?: string | null;
  urlImg?: string | null;
  actualizacionCap?: string | null;
  created_at?: string | null;
  state_id?: number | null;
  genders?: { gender: Named }[];
  lastChapters?: ChapterDto[];
  trending?: { visitas?: number | null } | null;
  autors?: { autor: Named }[];
  artists?: { artist: Named }[];
}

const STATUS: Record<number, MangaStatus> = { 1: 'ongoing', 2: 'hiatus', 3: 'cancelled', 4: 'completed' };

export abstract class MoonlightTL {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly lang: string;

  userAgent = USER_AGENT;
  seriesPath = '/ver';

  intl(key: string): string {
    return (MESSAGES[this.lang] ?? MESSAGES.en!)[key] ?? MESSAGES.en![key] ?? key;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async api<T>(path: string): Promise<T> {
    const response = await http.get(`${this.baseUrl}${path}`, { headers: this.headers() });
    return (JSON.parse(response.body) as { response: T }).response;
  }

  toSummary(s: SeriesDto): MangaSummary {
    return { url: `${this.seriesPath}/${s.slug}`, title: s.name, thumbnailUrl: s.urlImg || undefined };
  }

  async getPopular(): Promise<MangaPage> {
    const top = await this.api<{
      mensual: { project: SeriesDto }[][];
      semanal: { project: SeriesDto }[][];
      diario: { project: SeriesDto }[][];
    }>('/api/topSerie');
    const all = [...top.diario.flat(), ...top.semanal.flat(), ...top.mensual.flat()].map((p) => p.project);
    const seen = new Set<string>();
    return {
      items: all.filter((s) => !seen.has(s.slug) && seen.add(s.slug)).map((s) => this.toSummary(s)),
      hasNextPage: false,
    };
  }

  async getLatest(): Promise<MangaPage> {
    const list = await this.api<SeriesDto[]>('/api/lastUpdates');
    return { items: list.map((s) => this.toSummary(s)), hasNextPage: false };
  }

  async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
    const comics = await this.api<SeriesDto[]>('/api/comics');
    let list = comics;
    if (query.trim()) {
      if (query.length < 2) throw new Error(this.intl('search_length_error'));
      const needle = query.toLowerCase();
      list = comics.filter(
        (s) => s.name.toLowerCase().includes(needle) || s.alternativeName?.toLowerCase().includes(needle),
      );
    }
    const status = Number(filters.status ?? 0);
    if (status !== 0) list = list.filter((s) => s.state_id === status);
    const sort = (filters.sort as SortValue | undefined) ?? { value: 'updated_at', ascending: false };
    const key = (s: SeriesDto): string | number => {
      switch (sort.value) {
        case 'name':
          return s.name;
        case 'views':
          return s.trending?.visitas ?? 0;
        case 'created_at':
          return s.created_at ?? '';
        default:
          return s.actualizacionCap ?? '';
      }
    };
    list = list.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    if (!sort.ascending) list.reverse();
    return { items: list.map((s) => this.toSummary(s)), hasNextPage: false };
  }

  getFilters(): Filter[] {
    return [
      {
        type: 'sort',
        id: 'sort',
        label: this.intl('sort_by'),
        options: [
          { label: this.intl('sort_name'), value: 'name' },
          { label: this.intl('sort_views'), value: 'views' },
          { label: this.intl('sort_updated'), value: 'updated_at' },
          { label: this.intl('sort_created'), value: 'created_at' },
        ],
        default: { value: 'updated_at', ascending: false },
      },
      {
        type: 'select',
        id: 'status',
        label: this.intl('status'),
        options: [
          { label: this.intl('status_all'), value: '0' },
          { label: this.intl('status_ongoing'), value: '1' },
          { label: this.intl('status_hiatus'), value: '2' },
          { label: this.intl('status_dropped'), value: '3' },
          { label: this.intl('status_completed'), value: '4' },
        ],
        default: '0',
      },
    ];
  }

  // Details and chapters come from the same endpoint.
  async fetchSeries(manga: MangaSummary): Promise<SeriesDto> {
    return this.api<SeriesDto>(`/api/showProject/${manga.url.substring(manga.url.lastIndexOf('/') + 1)}`);
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const s = await this.fetchSeries(manga);
    let description = s.sinopsis ?? '';
    if (s.alternativeName?.trim()) {
      if (description.trim()) description += '\n\n';
      description += `${this.intl('alternative_names')}: ${s.alternativeName}`;
    }
    return {
      ...this.toSummary(s),
      description: description || undefined,
      genres: (s.genders ?? []).map((g) => g.gender.name),
      author: (s.autors ?? []).map((a) => a.autor.name).join(', ') || undefined,
      artist: (s.artists ?? []).map((a) => a.artist.name).join(', ') || undefined,
      status: STATUS[s.state_id ?? 0] ?? 'unknown',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const s = await this.fetchSeries(manga);
    return (s.lastChapters ?? []).map((c) => {
      let name = `${this.intl('chapter')} ${String(c.num).replace(/\.0$/, '')}`;
      if (c.name?.trim()) name += ` - ${c.name}`;
      return {
        url: `${this.seriesPath}/${s.slug}/${c.slug}`,
        name,
        number: c.num,
        uploadedAt: Date.parse(c.created_at) || undefined,
      };
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const url = `${this.baseUrl}${chapter.url}`;
    const response = await http.get(url, { headers: this.headers() });
    return this.pageListParse(html.load(response.body, { baseUrl: response.url }), response.url);
  }

  async pageListParse(document: HtmlElement, location: string): Promise<Page[]> {
    let doc = document;
    const form = doc.selectFirst('form[method=post]');
    if (form) {
      const fields: Record<string, string> = {};
      for (const input of form.select('input')) fields[input.attr('name') ?? ''] = input.attr('value') ?? '';
      const response = await http.post(
        form.absUrl('action') || form.attr('action') || location,
        { form: fields },
        { headers: { ...this.headers(), Referer: location } },
      );
      doc = html.load(response.body, { baseUrl: response.url });
    }
    return doc
      .select('main.contenedor.read img, main > img')
      .map((img, index) => ({ index, imageUrl: this.imgAttr(img) }));
  }

  imgAttr(element: HtmlElement): string {
    for (const name of ['data-lazy-src', 'data-src', 'data-cfsrc']) {
      if (element.attr(name) !== undefined) return element.absUrl(name) ?? '';
    }
    return element.absUrl('src') ?? '';
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    if (hostOf(url) !== hostOf(this.baseUrl)) return null;
    const slug = new RegExp(`^https?://[^/]+${this.seriesPath}/([^/?#]+)`, 'i').exec(url)?.[1];
    return slug ? { url: `${this.seriesPath}/${slug}`, title: '' } : null;
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url}`;
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: () => this.getPopular(),
      getLatest: () => this.getLatest(),
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
