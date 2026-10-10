import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://egotoons.com';
const API_URL = 'https://api.egotoons.com';
const MANGA_PAGE_SIZE = 24;
const CHAPTER_PAGE_SIZE = 80;
const MANIFEST_PAGE_SIZE = 24;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Option {
  id: number;
  nome: string;
}
interface MangaDto {
  id: number;
  nome: string;
  imagem?: string | null;
  descricao?: string | null;
  formato_nome?: string | null;
  status_nome?: string | null;
  tags?: Option[];
}
interface ChapterDto {
  id: number;
  obra_id: number;
  numero: string;
  numero_key?: string | null;
  titulo?: string | null;
  nome?: string | null;
  criado_em?: string | null;
}

const SORTS = [
  { label: 'Mais recentes', value: 'recentes' },
  { label: 'Mais populares', value: 'populares' },
  { label: 'A-Z', value: 'alfabetica' },
];

const get = async <T>(url: string, extra: Record<string, string> = {}): Promise<T> =>
  (await http.get<T>(url, { headers: { ...headers, ...extra }, responseType: 'json' })).body;

const absolute = (path: string, base: string) => (/^https?:\/\//.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`);

function summary(m: MangaDto): MangaSummary {
  return { url: `/obra/${m.id}`, title: m.nome, thumbnailUrl: m.imagem ? absolute(m.imagem, BASE_URL) : undefined };
}

const STATUS: Record<string, MangaStatus> = {
  ativo: 'ongoing',
  'em andamento': 'ongoing',
  'em-andamento': 'ongoing',
  finalizado: 'completed',
  completo: 'completed',
  hiato: 'hiatus',
};

async function list(page: number, query: string, filters: FilterState, defaultSort: string): Promise<MangaPage> {
  const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : defaultSort;
  const params = [`pagina=${page}`, `limite=${MANGA_PAGE_SIZE}`, `ordenarPor=${sort}`];
  if (query.trim()) params.push(`busca=${encodeURIComponent(query)}`);
  if (typeof filters.formato_id === 'string' && filters.formato_id) params.push(`formato_id=${filters.formato_id}`);
  if (typeof filters.status_id === 'string' && filters.status_id) params.push(`status_id=${filters.status_id}`);
  const tags = Object.entries(filters)
    .filter(([id, value]) => id.startsWith('tag.') && value === true)
    .map(([id]) => id.slice(4));
  if (tags.length) params.push(`tag_ids=${encodeURIComponent(tags.join(','))}`);
  const result = await get<{ obras: MangaDto[]; pagination: { hasNextPage: boolean } }>(
    `${BASE_URL}/api/obras.js?${params.join('&')}`,
  );
  return { items: result.obras.map(summary), hasNextPage: result.pagination.hasNextPage };
}

const idOf = (url: string) => /\/(?:obra|manga)\/(\d+)/.exec(url)?.[1] ?? '';
const numberOf = (url: string) => /\/(?:capitulo|chapter)\/([^/?#]+)/.exec(url)?.[1] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, '', {}, 'populares'),
    getLatest: (page) => list(page, '', {}, 'recentes'),
    search: (query, page, filters) => list(page, query, filters, 'recentes'),
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [{ type: 'select', id: 'sort', label: 'Ordenar por', options: SORTS, default: 'recentes' }];
      const [formats, statuses, tags] = await Promise.all([
        get<{ formatos: Option[] }>(`${BASE_URL}/api/filtros/formatos.js`).then((r) => r.formatos).catch(() => []),
        get<{ status: Option[] }>(`${BASE_URL}/api/filtros/status.js`).then((r) => r.status).catch(() => []),
        get<{ tags: Option[] }>(`${BASE_URL}/api/filtros/tags.js`).then((r) => r.tags).catch(() => []),
      ]);
      const select = (id: string, label: string, options: Option[]): Filter => ({
        type: 'select',
        id,
        label,
        options: [{ label: 'Todos', value: '' }, ...options.map((o) => ({ label: o.nome, value: String(o.id) }))],
        default: '',
      });
      if (formats.length) filters.push(select('formato_id', 'Formato', formats));
      if (statuses.length) filters.push(select('status_id', 'Status', statuses));
      if (tags.length)
        filters.push({
          type: 'group',
          id: 'tags',
          label: 'Tags',
          filters: tags.map((t): Filter => ({ type: 'checkbox', id: `tag.${t.id}`, label: t.nome })),
        });
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { obra } = await get<{ obra: MangaDto }>(`${BASE_URL}/api/obras/${idOf(manga.url)}`);
      const genres = [...new Set([obra.formato_nome, ...(obra.tags ?? []).map((t) => t.nome)].filter((g): g is string => !!g?.trim()))];
      return {
        ...summary(obra),
        description: obra.descricao ? htmlToText(obra.descricao) : undefined,
        genres,
        status: STATUS[(obra.status_nome ?? '').toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const fetchPage = (page: number) =>
        get<{ capitulos: ChapterDto[]; pagination: { totalPaginas: number } }>(
          `${BASE_URL}/api/obras/${id}/capitulos.js?pagina=${page}&limite=${CHAPTER_PAGE_SIZE}&ordenar=desc&fields=list`,
        );
      const first = await fetchPage(1);
      const all = [...first.capitulos];
      for (let page = 2; page <= first.pagination.totalPaginas; page++) all.push(...(await fetchPage(page)).capitulos);
      return all.map((c) => {
        const slug = c.numero_key ?? c.numero.replace(/\.00$/, '').replace(/\.0$/, '');
        const time = c.criado_em ? Date.parse(c.criado_em) : Number.NaN;
        return {
          url: `/obra/${c.obra_id}/capitulo/${slug}`,
          name: c.titulo?.trim() || c.nome?.trim() || `Capítulo ${slug}`,
          number: Number.parseFloat(c.numero) || undefined,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = idOf(chapter.url);
      const number = numberOf(chapter.url);
      const detail = await get<{ capitulo: ChapterDto }>(`${BASE_URL}/api/obras/${id}/capitulos/${number}/index.js`);
      const referer = `${BASE_URL}/obra/${id}/capitulo/${number}`;
      const pages: Page[] = [];
      for (let offset: number | null = 0; offset !== null; ) {
        const manifest: { pages: { index: number; url: string }[]; nextOffset?: number | null } = await get(
          `${API_URL}/api/leitor/capitulos/${detail.capitulo.id}/manifest?offset=${offset}&limit=${MANIFEST_PAGE_SIZE}`,
          { Referer: referer },
        );
        for (const p of manifest.pages) pages.push({ index: p.index, imageUrl: absolute(p.url, API_URL), url: referer });
        offset = manifest.nextOffset ?? null;
      }
      return pages;
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const id = idOf(url);
      return hostOf(url).replace(/^www\./, '') === hostOf(BASE_URL) && id ? { url: `/obra/${id}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}/obra/${idOf(item.url)}${'name' in item ? `/capitulo/${numberOf(item.url)}` : ''}`,
  }),
});
