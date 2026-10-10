// MangoTheme (JSON API sites), ported from keiyoushi/extensions-source lib-multisrc/mangotheme. This directory
// is a template: every extension using the theme keeps an identical copy in src/mangotheme/
// (`node scripts/sync-multisrc.mjs`).
//
// Not ported: the e-mail/password login of sites that require one, and AES-decrypting of responses flagged
// with `x-encrypted` (sites that need either are not supported).
//
// Manga urls are "/obra/<id>[?slug=<slug>]", chapter urls "/obra/<id>/capitulo/<number>[?slug=<slug>]".
import type {
  Chapter,
  Filter,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT } from './utils';

/** [label, value] */
export type Option = [string, string];

export interface TagOption {
  name: string;
  id: string;
}

interface Response<T> {
  sucesso?: boolean;
  success?: boolean;
  pagination?: { hasNextPage?: boolean };
  [key: string]: unknown;
  _?: T;
}

interface TagDto {
  id: number;
  nome?: string;
  name?: string;
}

interface ChapterDto {
  id?: number;
  obra_id: number;
  numero: string | number;
  nome?: string;
  title?: string;
  criado_em?: string;
  atualizado_em?: string;
}

interface PageDto {
  numero: number;
  cdn_id?: string;
  imagem?: string;
  image?: string;
  src?: string;
  link?: string;
  path?: string;
  arquivo?: string;
}

interface MangaDto {
  id?: number;
  title?: string;
  nome?: string;
  slug?: string;
  nome_url?: string;
  permalink?: string;
  url?: string;
  coverImage?: string;
  imagem?: string;
  banner_imagem?: string;
  descricao?: string;
  description?: string;
  status_id?: number;
  status_nome?: string;
  tags?: TagDto[];
  capitulos?: ChapterDto[];
  chapters?: ChapterDto[];
}

const PAYLOAD_KEYS = ['dados', 'obras', 'obra', 'data', 'capitulos', 'capitulo', 'formatos', 'status', 'tags'];

function payload<T>(response: Response<T>): T {
  for (const key of PAYLOAD_KEYS) {
    if (response[key] != null) return response[key] as T;
  }
  throw new Error('Response payload not found');
}

export abstract class MangoTheme {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  webMangaPathSegment = 'obra';
  webChapterPathSegment = 'capitulo';
  webUrlSalt: string | null = null;
  webUrlWindowMillis = 7_200_000;
  latestPageSize = 24;
  searchPageSize = 20;
  lang = 'pt-BR';

  get apiUrl(): string {
    return `${this.baseUrl}/api`;
  }

  get cdnUrl(): string {
    return this.baseUrl;
  }

  abstract getFormatFilterOptions(): Option[];
  abstract getStatusFilterOptions(): Option[];
  abstract getTagFilterOptions(): TagOption[];

  /** Headers of every api request (override to add tokens). */
  async requestHeaders(): Promise<Record<string, string>> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/`, 'Accept-Language': `${this.lang}, en-US;q=0.8, en;q=0.7` };
  }

  async api<T>(path: string): Promise<Response<T>> {
    const response = await http.get<Response<T>>(`${this.apiUrl}${path}`, {
      headers: await this.requestHeaders(),
      responseType: 'json',
    });
    return response.body;
  }

  // Browse
  async getPopular(): Promise<MangaPage> {
    const result = await this.api<MangaDto[]>('/obras/top10/views?periodo=total');
    return { items: payload(result).map((m) => this.toMangaSummary(m)), hasNextPage: false };
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseMangaPage(await this.api<MangaDto[]>(`/capitulos/recentes?pagina=${page}&limite=${this.latestPageSize}`));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const params: string[] = [`pagina=${page}`, `limite=${this.searchPageSize}`];
    if (query.trim()) params.push(`busca=${encodeURIComponent(query.trim())}`);
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
    if (text('status')) params.push(`status_id=${encodeURIComponent(text('status'))}`);
    if (text('format')) params.push(`formato_id=${encodeURIComponent(text('format'))}`);
    if (/^\d+$/.test(text('minChapters'))) params.push(`min_capitulos=${text('minChapters')}`);
    const tags = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('tag.') && value === true)
      .map(([id]) => id.slice('tag.'.length));
    if (tags.length > 0) params.push(`tag_ids=${encodeURIComponent(tags.join(','))}`);
    return this.parseMangaPage(await this.api<MangaDto[]>(`/obras?${params.join('&')}`));
  }

  parseMangaPage(result: Response<MangaDto[]>): MangaPage {
    return {
      items: payload(result).map((m) => this.toMangaSummary(m)),
      hasNextPage: result.pagination?.hasNextPage === true,
    };
  }

  getFilters(): Filter[] {
    const toOptions = (options: Option[]) => options.map(([label, value]) => ({ label, value }));
    const filters: Filter[] = [
      { type: 'select', id: 'status', label: 'Status', options: toOptions(this.getStatusFilterOptions()) },
      { type: 'select', id: 'format', label: 'Formato', options: toOptions(this.getFormatFilterOptions()) },
      { type: 'text', id: 'minChapters', label: 'Capítulos mínimos' },
    ];
    const tags = this.getTagFilterOptions();
    if (tags.length > 0) {
      filters.push({
        type: 'group',
        id: 'tag',
        label: 'Tags',
        filters: tags.map((t) => ({ type: 'checkbox' as const, id: `tag.${t.id}`, label: t.name })),
      });
    }
    return filters;
  }

  // Details and chapters come from the same endpoint.
  async fetchManga(manga: MangaSummary): Promise<MangaDto> {
    return payload((await this.api<MangaDto>(`/obras/${extractMangaId(manga.url)}`)) as Response<MangaDto>);
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const dto = await this.fetchManga(manga);
    const summary = this.toMangaSummary(dto, extractStoredSlug(manga.url));
    const tags = (dto.tags ?? []).map((t) => (t.nome ?? t.name ?? '').trim()).filter(Boolean);
    return {
      ...summary,
      description: (dto.descricao ?? dto.description)?.trim() || undefined,
      genres: tags.length > 0 ? tags : undefined,
      status: parseStatus(dto.status_nome, dto.status_id),
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const dto = await this.fetchManga(manga);
    const slug = dto.slug ?? dto.nome_url ?? dto.permalink ?? dto.url ?? (extractStoredSlug(manga.url) || undefined);
    return (dto.capitulos ?? dto.chapters ?? [])
      .map((c) => this.toChapter(c, slug))
      .sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const mangaId = chapter.url.split('/obra/')[1]?.split('/')[0] ?? '';
    const chapterNumber = lastSegment(chapter.url);
    const result = payload(
      (await this.api<{ paginas?: PageDto[]; pages?: PageDto[] }>(
        `/obras/${mangaId}/capitulos/${chapterNumber}`,
      )) as Response<{ paginas?: PageDto[]; pages?: PageDto[] }>,
    );
    const pages = (result.paginas ?? result.pages ?? [])
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((p) => p.cdn_id ?? p.imagem ?? p.image ?? p.src ?? p.link ?? p.path ?? p.arquivo)
      .filter((url): url is string => !!url && url.trim() !== '')
      .map((url) => (/^https?:\/\//i.test(url) ? url : `${this.cdnUrl}/${url.replace(/^\/+/, '')}`))
      .map((imageUrl, index) => ({ index, imageUrl }));
    if (pages.length === 0) throw new Error('No valid page URLs found in chapter response');
    return pages;
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Mapping
  toMangaSummary(dto: MangaDto, fallbackSlug?: string): MangaSummary {
    if (dto.id == null) throw new Error('Missing manga id');
    const slug = dto.slug ?? dto.nome_url ?? dto.permalink ?? dto.url ?? fallbackSlug;
    const cover = dto.coverImage ?? dto.imagem ?? dto.banner_imagem;
    return {
      url: `/obra/${dto.id}${toStoredSlug(slug) ? `?slug=${toStoredSlug(slug)}` : ''}`,
      title: dto.title ?? dto.nome ?? '',
      thumbnailUrl: cover?.trim()
        ? /^https?:\/\//i.test(cover)
          ? cover
          : `${this.cdnUrl}/${cover.replace(/^\/+/, '')}`
        : undefined,
    };
  }

  toChapter(dto: ChapterDto, mangaSlug?: string): Chapter {
    const formatted = formatChapterNumber(String(dto.numero));
    const slug = toStoredSlug(mangaSlug);
    const created = dto.criado_em ?? dto.atualizado_em;
    return {
      url: `/obra/${dto.obra_id}/capitulo/${formatted}${slug ? `?slug=${slug}` : ''}`,
      name: `Capitulo ${formatted}`,
      number: Number.parseFloat(String(dto.numero)) || -1,
      uploadedAt: parseApiDate(created),
    };
  }

  // URLs
  webMangaReference(url: string): string {
    return this.webUrlSalt != null
      ? this.buildWebMangaSlug(extractMangaId(url))
      : extractStoredSlug(url) || extractMangaId(url);
  }

  buildTimedWebMangaReference(mangaId: string, hash: string): string {
    return `${mangaId}-${hash}`;
  }

  buildWebMangaSlug(mangaId: string): string {
    if (this.webUrlSalt == null) return mangaId;
    const window = Math.floor(Date.now() / this.webUrlWindowMillis);
    const text = `${mangaId}-${window}-${this.webUrlSalt}`;
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return this.buildTimedWebMangaReference(mangaId, Math.abs(hash).toString(36));
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    if (item.url.includes('/capitulo/')) {
      const mangaId = item.url.split('/obra/')[1]?.split('/')[0] ?? '';
      const reference =
        this.webUrlSalt != null ? this.buildWebMangaSlug(mangaId) : extractStoredSlug(item.url) || mangaId;
      return `${this.baseUrl}/${this.webMangaPathSegment}/${reference}/${this.webChapterPathSegment}/${lastSegment(item.url)}`;
    }
    return `${this.baseUrl}/${this.webMangaPathSegment}/${this.webMangaReference(item.url)}`;
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = new RegExp(
      `^https?://${escapeRegex(this.baseUrl.replace(/^https?:\/\//, ''))}/${this.webMangaPathSegment}/(\\d+)(?:-[^/?#]*)?`,
      'i',
    ).exec(url.trim());
    return match ? { url: `/obra/${match[1]}`, title: '' } : null;
  }

  toSource(): Source {
    const source: Source = {
      baseUrl: this.baseUrl,
      getPopular: () => this.getPopular(),
      getLatest: (page) => this.getLatest(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      getWebUrl: (item) => this.getWebUrl(item),
    };
    // Web urls built from a slug carry no id to resolve; only id-based ones can be.
    if (this.webUrlSalt != null) source.resolveUrl = (url) => this.resolveUrl(url);
    return source;
  }
}

// Helpers
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lastSegment(url: string): string {
  return (url.split('/').pop() ?? '').split('?')[0]!.split('#')[0]!;
}

function extractMangaId(url: string): string {
  return lastSegment(url).split('-')[0]!;
}

function extractStoredSlug(url: string): string {
  const query = url.split('?slug=')[1];
  return query ? query.split('&')[0]! : '';
}

function toStoredSlug(value: string | undefined | null): string | undefined {
  const slug = value?.trim().split('?')[0]?.replace(/\/+$/, '').split('/').pop();
  return slug ? slug : undefined;
}

function formatChapterNumber(value: string): string {
  const number = Number.parseFloat(value);
  return Number.isNaN(number) ? value : String(number);
}

function parseStatus(name: string | undefined, id: number | undefined): MangaStatus {
  switch (name?.trim()) {
    case 'Ativo':
    case 'Em Andamento':
      return 'ongoing';
    case 'Concluído':
      return 'completed';
    case 'Hiato':
    case 'Pausado':
      return 'hiatus';
    case 'Cancelado':
      return 'cancelled';
  }
  switch (id) {
    case 1:
    case 6:
      return 'ongoing';
    case 2:
    case 5:
      return 'hiatus';
    case 3:
      return 'completed';
    case 4:
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** ISO date, tolerating a "T24:mm" midnight overflow. */
function parseApiDate(value: string | undefined): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const overflow = /^(\d{4}-\d{2}-\d{2})T24:(\d{2}:\d{2}(?:\.\d{1,3})?)(.*)$/.exec(text);
  let normalized = text;
  if (overflow) {
    const next = new Date(`${overflow[1]}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    normalized = `${next.toISOString().slice(0, 10)}T00:${overflow[2]}${overflow[3]}`;
  }
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? undefined : time;
}
