// GreenShit (JSON API), ported from keiyoushi/extensions-source lib-multisrc/greenshit. This directory is a
// template: every extension using the theme keeps an identical copy in src/greenshit/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/obra/<id>", chapter urls "/capitulo/<id>".
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText, withQuery } from './utils';

export const LOGIN_PREFERENCES: Preference[] = [
  { type: 'text', key: 'email', label: 'Email', description: 'Email para login automático', default: '' },
  {
    type: 'text',
    key: 'password',
    label: 'Senha',
    description: 'Senha para login automático. Stored as plain text.',
    default: '',
  },
];

export type Pair = readonly [name: string, value: string];

interface MangaDto {
  obr_id: number;
  obr_nome: string;
  obr_descricao?: string | null;
  obr_imagem?: string | null;
  genero?: { gen_nome?: string } | null;
  tags?: { tag_nome?: string }[] | null;
  status?: { stt_nome: string } | null;
  scan_id?: number;
  capitulos?: ChapterDto[] | null;
}

interface ChapterDto {
  cap_id: number;
  cap_nome: string;
  cap_numero?: number | null;
  cap_criado_em?: string | null;
  cap_liberado?: boolean;
}

interface ListDto {
  obras: MangaDto[];
  currentPage?: number;
  pagina_atual?: number;
  pagina?: number;
  totalPages?: number;
  paginas?: number;
  totalPaginas?: number;
}

interface ChapterDetailDto {
  cap_numero?: number | null;
  cap_paginas?: (string | { src: string; mime?: string | null })[] | null;
  obra?: { obr_id: number; scan_id?: number } | null;
}

interface FiltersDto {
  generos?: { gen_nome: string; gen_id?: number }[];
  tags?: { tag_nome: string; tag_id?: number }[];
}

export const FORMATS: Pair[] = [
  ['Todos', ''],
  ['Mangá', '3'],
  ['Manhua', '2'],
  ['Manhwa', '1'],
];
export const STATUSES: Pair[] = [
  ['Todos', ''],
  ['Cancelado', '4'],
  ['Concluído', '2'],
  ['Em Andamento', '1'],
  ['Hiato', '3'],
];
export const ORDERS: Pair[] = [
  ['Última atualização', 'ultima_atualizacao'],
  ['Lançamentos', 'criacao'],
  ['Mais Visualizadas', 'visualizacoes_geral'],
  ['Melhor avaliação', 'rating'],
  ['A-Z', 'nome'],
];

const options = (pairs: readonly Pair[]): FilterOption[] => pairs.map(([label, value]) => ({ label, value }));

export abstract class GreenShit {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly apiUrl: string;
  abstract readonly cdnApiUrl: string;
  abstract readonly cdnUrl: string;
  abstract readonly scanId: string;

  userAgent = USER_AGENT;
  defaultGenreId = '1';
  limitPerPage = '26';
  supportsFilters = true;
  formatsList: Pair[] = FORMATS;
  statusList: Pair[] = STATUSES;
  ordersList: Pair[] = ORDERS;
  genresList: Pair[] = [];
  tagsList: Pair[] = [];

  private token: { value: string; user: string; expires: number } | null = null;

  headers(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      Referer: `${this.baseUrl}/`,
      Accept: 'application/json',
      'scan-id': this.scanId,
    };
  }

  /** Headers with a Bearer token when the account preferences are filled in (login failures are ignored). */
  async authHeaders(): Promise<Record<string, string>> {
    const user = prefs.get<string>('email')?.trim() ?? '';
    const password = prefs.get<string>('password') ?? '';
    if (!user || !password) return this.headers();
    if (!this.token || this.token.user !== user || Date.now() > this.token.expires) {
      this.token = null;
      try {
        const body = (
          await http.post<{ access_token?: string; token?: string; expires_in?: number }>(
            `${this.apiUrl}/auth/login`,
            { json: { login: user, senha: password, tipo_usuario: 'usuario' } },
            { headers: this.headers(), responseType: 'json' },
          )
        ).body;
        const value = body.access_token ?? body.token;
        if (value) this.token = { value, user, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
      } catch (error) {
        log.warn('Login failed', error);
      }
    }
    return this.token ? { ...this.headers(), Authorization: `Bearer ${this.token.value}` } : this.headers();
  }

  async api<T>(url: string): Promise<T> {
    return (await http.get<T>(url, { headers: await this.authHeaders(), responseType: 'json' })).body;
  }

  // Listing
  getPopular(page: number): Promise<MangaPage> {
    return this.list(
      withQuery(`${this.apiUrl}/obras/ranking`, {
        tipo: 'visualizacoes_geral',
        limite: this.limitPerPage,
        pagina: String(page),
        gen_id: this.defaultGenreId,
      }),
    );
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.list(
      withQuery(`${this.apiUrl}/obras/atualizacoes`, {
        pagina: String(page),
        limite: this.limitPerPage,
        gen_id: this.defaultGenreId,
      }),
    );
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [
      ['limite', this.limitPerPage],
      ['pagina', String(page)],
    ];
    if (query.trim()) params.push(['obr_nome', query.trim()]);
    const picked = (prefix: string) =>
      Object.entries(filters)
        .filter(([id, value]) => id.startsWith(`${prefix}.`) && value === true)
        .map(([id]) => id.slice(prefix.length + 1));
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const genres = picked('genre');
    if (genres.length > 0) for (const id of genres) params.push(['gen_id', id]);
    else params.push(['todos_generos', '1']);
    if (text('format')) params.push(['formt_id', text('format')]);
    if (text('status')) params.push(['stt_id', text('status')]);
    if (text('order')) params.push(['orderBy', text('order')]);
    for (const id of picked('tag')) params.push(['tag_ids', id]);
    const queryString = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return this.list(`${this.apiUrl}/obras/buscar?${queryString}`);
  }

  async list(url: string): Promise<MangaPage> {
    const dto = await this.api<ListDto>(url);
    const current = dto.currentPage ?? dto.pagina_atual ?? dto.pagina ?? 0;
    const total = dto.totalPages ?? dto.paginas ?? dto.totalPaginas ?? 0;
    return { items: dto.obras.map((m) => this.toSummary(m)), hasNextPage: total > current };
  }

  toSummary(m: MangaDto): MangaSummary {
    return {
      url: `/obra/${m.obr_id}`,
      title: m.obr_nome,
      thumbnailUrl: this.imageUrl(`/scans/${m.scan_id ?? 0}/obras/${m.obr_id}/`, m.obr_imagem ?? '', 300) || undefined,
    };
  }

  // Details and chapters
  idOf(url: string): string {
    return url.replace(/^.*\/obras?\//, '').split(/[/?#]/)[0] ?? '';
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const dto = await this.api<MangaDto>(`${this.apiUrl}/obras/${this.idOf(manga.url)}`);
    return {
      ...this.toSummary(dto),
      description: dto.obr_descricao ? htmlToText(dto.obr_descricao) : undefined,
      genres: [dto.genero?.gen_nome, ...(dto.tags ?? []).map((t) => t.tag_nome)].filter(
        (g): g is string => !!g?.trim(),
      ),
      status: this.toStatus(dto.status?.stt_nome),
    };
  }

  toStatus(name: string | undefined): MangaStatus {
    switch (name?.toLowerCase()) {
      case 'em andamento':
      case 'ativo':
        return 'ongoing';
      case 'concluído':
        return 'completed';
      case 'hiato':
        return 'hiatus';
      case 'cancelado':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const dto = await this.api<MangaDto>(`${this.apiUrl}/obras/${this.idOf(manga.url)}`);
    const seen = new Set<string>();
    return (dto.capitulos ?? [])
      .map((c): Chapter => {
        const date = c.cap_criado_em ? Date.parse(c.cap_criado_em) : Number.NaN;
        return {
          url: `/capitulo/${c.cap_id}`,
          name: `${c.cap_liberado === false ? '🔒 ' : ''}${c.cap_nome}`,
          number: c.cap_numero ?? 0,
          uploadedAt: Number.isFinite(date) ? date : undefined,
        };
      })
      .filter((c) => !seen.has(c.url) && seen.add(c.url))
      .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const id = chapter.url.replace(/^.*\/capitulo\//, '');
    const response = await http.request<string>({
      url: `${this.apiUrl}/capitulos/${id}`,
      method: 'GET',
      headers: await this.authHeaders(),
    });
    if (response.status === 403) {
      let message = 'Faça login';
      try {
        message = (JSON.parse(response.body) as { message?: string }).message ?? message;
      } catch {
        // Not JSON: keep the default message.
      }
      throw new Error(message);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    const dto = JSON.parse(response.body) as ChapterDetailDto;
    const obraId = dto.obra?.obr_id ?? 0;
    const scanId = dto.obra?.scan_id ?? 0;
    const number = String(dto.cap_numero ?? 0);
    return (dto.cap_paginas ?? []).map((p, index) => {
      const page = typeof p === 'string' ? { src: p, mime: null } : p;
      return {
        index,
        imageUrl: this.imageUrl(
          `/scans/${scanId}/obras/${obraId}/capitulos/${number}/`,
          page.src,
          null,
          this.cdnUrl,
          page.mime,
        ),
      };
    });
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  imageUrl(path: string, src: string, width: number | null, base = this.cdnApiUrl, mime?: string | null): string {
    if (!src.trim()) return '';
    if (src.startsWith('http')) return src;
    const wpLike =
      src.startsWith('uploads/') ||
      src.startsWith('wp-content/') ||
      src.startsWith('manga_') ||
      src.startsWith('WP-manga');
    let url: string;
    if (wpLike || mime) {
      if (src.startsWith('manga_')) url = `${base}/wp-content/uploads/WP-manga/data/${src}`;
      else if (src.startsWith('WP-manga')) url = `${base}/wp-content/uploads/${src}`;
      else if (src.startsWith('uploads/')) url = `${base}/wp-content/${src}`;
      else if (src.startsWith('wp-content/')) url = `${base}/${src}`;
      else url = `${base}/wp-content/uploads/WP-manga/data/${src.replace(/^\/+/, '')}`;
    } else {
      url = `${base}/${path}/${src}${width ? `?width=${width}` : ''}`;
    }
    return url.replace(/(?<!:)\/{2,}/g, '/');
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    if (!this.supportsFilters) return [];
    let fetched: FiltersDto = {};
    if (this.genresList.length === 0 || this.tagsList.length === 0) {
      try {
        fetched = await this.api<FiltersDto>(`${this.apiUrl}/obras/filtros`);
      } catch (error) {
        log.warn('Cannot load filters', error);
      }
    }
    const genres =
      this.genresList.length > 0
        ? this.genresList
        : (fetched.generos ?? []).map((g): Pair => [g.gen_nome, String(g.gen_id ?? 0)]);
    const tags =
      this.tagsList.length > 0
        ? this.tagsList
        : (fetched.tags ?? []).map((t): Pair => [t.tag_nome, String(t.tag_id ?? 0)]);
    const filters: Filter[] = [];
    if (this.formatsList.length > 0)
      filters.push({ type: 'select', id: 'format', label: 'Formato', options: options(this.formatsList) });
    if (this.statusList.length > 0)
      filters.push({ type: 'select', id: 'status', label: 'Status', options: options(this.statusList) });
    if (this.ordersList.length > 0)
      filters.push({ type: 'select', id: 'order', label: 'Ordenar Por', options: options(this.ordersList) });
    if (genres.length > 0) {
      filters.push({
        type: 'group',
        id: 'genre',
        label: 'Gêneros',
        filters: genres.map(([label, value]) => ({ type: 'checkbox', id: `genre.${value}`, label })),
      });
    }
    if (tags.length > 0) {
      filters.push({
        type: 'group',
        id: 'tag',
        label: 'Tags',
        filters: tags.map(([label, value]) => ({ type: 'checkbox', id: `tag.${value}`, label })),
      });
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/obras?\/(\d+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/obra/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url.replace('obra/', 'obras/')}`;
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
