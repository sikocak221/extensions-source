import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, htmlToText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://taosect.com';
const API = `${BASE_URL}/wp-json/wp/v2`;
const PROJECTS_PER_PAGE = 18;
const LATEST_CHAPTERS_PER_PAGE = 100;
const DEFAULT_FIELDS = 'title,thumbnail,link';
const SCANLATOR = 'Tao Sect';
const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: `${BASE_URL}/` };
const imageHeaders = {
  'User-Agent': USER_AGENT,
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  Referer: `${BASE_URL}/`,
};

interface Rendered {
  rendered?: string;
}
interface Tag {
  nome?: string;
}
interface ProjectDto {
  content?: Rendered;
  informacoes?: {
    arte?: string;
    generos?: Tag[];
    titulo_pais_origem?: string;
    roteiro?: string;
    serializacao?: string;
    status_scan?: Tag | null;
  };
  link?: string;
  title?: Rendered;
  thumbnail?: string;
}
interface ChapterDto {
  data_insercao?: string;
  id_capitulo?: string;
  nome_capitulo?: string;
  paginas?: string[];
  post_id?: string;
  slug?: string;
}

const COUNTRIES: [string, string][] = [
  ['59', 'China'],
  ['60', 'Coréia do Sul'],
  ['13', 'Japão'],
];
const STATUSES: [string, string][] = [
  ['3', 'Ativo'],
  ['5', 'Cancelado'],
  ['4', 'Finalizado'],
  ['6', 'One-shot'],
];
const GENRES: [string, string][] = [
  ['31', '4Koma'],
  ['24', 'Ação'],
  ['84', 'Adulto'],
  ['21', 'Artes Marciais'],
  ['25', 'Aventura'],
  ['26', 'Comédia'],
  ['66', 'Culinária'],
  ['78', 'Doujinshi'],
  ['22', 'Drama'],
  ['12', 'Ecchi'],
  ['30', 'Escolar'],
  ['76', 'Esporte'],
  ['23', 'Fantasia'],
  ['29', 'Harém'],
  ['75', 'Histórico'],
  ['83', 'Horror'],
  ['18', 'Isekai'],
  ['20', 'Light Novel'],
  ['61', 'Manhua'],
  ['56', 'Psicológico'],
  ['7', 'Romance'],
  ['27', 'Sci-fi'],
  ['28', 'Seinen'],
  ['55', 'Shoujo'],
  ['54', 'Shounen'],
  ['19', 'Slice of life'],
  ['17', 'Sobrenatural'],
  ['57', 'Tragédia'],
  ['62', 'Webtoon'],
];
const SORTS = [
  { value: 'date', label: 'Data de criação' },
  { value: 'modified', label: 'Data de modificação' },
  { value: 'title', label: 'Título' },
  { value: 'views', label: 'Visualizações' },
];

async function get<T>(url: string) {
  return http.get<T>(url, { headers, responseType: 'json' });
}

const summary = (p: ProjectDto): MangaSummary => ({
  title: decodeEntities(p.title?.rendered ?? ''),
  thumbnailUrl: p.thumbnail || undefined,
  url: relativeUrl(p.link ?? ''),
});

async function projectList(url: string, page: number): Promise<MangaPage> {
  const response = await get<ProjectDto[]>(url);
  const lastPage = Number(Object.entries(response.headers).find(([n]) => n.toLowerCase() === 'x-wp-totalpages')?.[1]);
  return {
    items: response.body.map(summary),
    hasNextPage: Number.isFinite(lastPage) && page < lastPage,
  };
}

const projectApiUrl = (slug: string, fields: string) =>
  `${API}/projetos?per_page=1&slug=${encodeURIComponent(slug)}&_fields=${fields}`;
const slugOf = (url: string) => (url.split('projeto/')[1] ?? '').split('/')[0] ?? '';

// Latest pages are built from the newest chapters; a project shows once.
let latestIds: string[] = [];
let latestChapterPage = 1;

const triGroup = (id: string, label: string, items: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: items.map(([value, name]): Filter => ({ type: 'tristate', id: `${id}.${value}`, label: name })),
});

function triParams(filters: FilterState, id: string, include: string, exclude: string): string[] {
  const out: string[] = [];
  for (const [mode, param] of [
    ['include', include],
    ['exclude', exclude],
  ] as const) {
    const values = Object.entries(filters)
      .filter(([key, v]) => key.startsWith(`${id}.`) && v === mode)
      .map(([key]) => key.slice(id.length + 1));
    if (values.length) out.push(`${param}=${encodeURIComponent(values.join(','))}`);
  }
  return out;
}

function countView(projectId: string, chapterId?: string): void {
  void http
    .post(
      `${BASE_URL}/wp-admin/admin-ajax.php`,
      {
        form: { action: 'update_views_v2', projeto: projectId, ...(chapterId ? { capitulo: chapterId } : {}) },
      },
      { headers },
    )
    .catch(() => undefined);
}

const toStatus = (status: string): MangaStatus => {
  if (status === 'Ativos') return 'ongoing';
  if (status === 'Finalizados' || status === 'Oneshots') return 'completed';
  if (status === 'Cancelados') return 'cancelled';
  return 'unknown';
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) =>
      projectList(
        `${API}/projetos?order=desc&orderby=views&page=${page}&per_page=${PROJECTS_PER_PAGE}&_fields=${DEFAULT_FIELDS}`,
        page,
      ),
    async getLatest(page): Promise<MangaPage> {
      if (page === 1) {
        latestIds = [];
        latestChapterPage = 1;
      }
      // Chapters of one project can fill whole pages; an empty page would stop paging in the app.
      let projectIds: string[] = [];
      let hasNextPage = false;
      do {
        const response = await get<ChapterDto[]>(
          `${API}/capitulos?order=desc&orderby=date&page=${latestChapterPage}&per_page=${LATEST_CHAPTERS_PER_PAGE}&_fields=post_id`,
        );
        const lastPage = Number(
          Object.entries(response.headers).find(([n]) => n.toLowerCase() === 'x-wp-totalpages')?.[1],
        );
        hasNextPage = latestChapterPage++ < lastPage;
        projectIds = [...new Set(response.body.map((c) => c.post_id ?? ''))].filter(
          (id) => id && !latestIds.includes(id),
        );
      } while (projectIds.length === 0 && hasNextPage);
      latestIds = [...latestIds, ...projectIds];
      if (projectIds.length === 0) return { items: [], hasNextPage: false };
      const projects = await get<ProjectDto[]>(
        `${API}/projetos?include=${projectIds.join(',')}&per_page=${projectIds.length}&orderby=include&_fields=${DEFAULT_FIELDS}`,
      );
      return { items: projects.body.map(summary), hasNextPage };
    },
    getFilters: (): Filter[] => [
      triGroup('country', 'País', COUNTRIES),
      triGroup('status', 'Status', STATUSES),
      triGroup('genre', 'Gêneros', GENRES),
      { type: 'sort', id: 'sort', label: 'Ordem', options: SORTS, default: { value: 'views', ascending: false } },
      { type: 'tristate', id: 'featured', label: 'Mostrar destaques' },
      { type: 'tristate', id: 'nsfw', label: 'Mostrar conteúdo +18' },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`, `per_page=${PROJECTS_PER_PAGE}`, `_fields=${DEFAULT_FIELDS}`];
      if (query) params.push(`search=${encodeURIComponent(query)}`);
      params.push(
        ...triParams(filters, 'country', 'paises', 'paises_exclude'),
        ...triParams(filters, 'status', 'situacao', 'situacao_exclude'),
        ...triParams(filters, 'genre', 'generos', 'generos_exclude'),
      );
      const sort = (filters.sort as SortValue | undefined) ?? { value: 'views', ascending: false };
      params.push(`order=${sort.ascending ? 'asc' : 'desc'}`, `orderby=${sort.value}`);
      if (!query) {
        if (filters.featured === 'include') params.push('destaque=1');
        else if (filters.featured === 'exclude') params.push('destaque=0');
      }
      if (filters.nsfw === 'include') params.push('mais_18=1');
      else if (filters.nsfw === 'exclude') params.push('mais_18=0');
      return projectList(`${API}/projetos?${params.join('&')}`, page);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const result = await get<ProjectDto[]>(
        projectApiUrl(slugOf(manga.url), 'title,informacoes,content,thumbnail,link'),
      );
      const project = result.body[0];
      if (!project) throw new Error('Projeto não encontrado.');
      const info = project.informacoes ?? {};
      return {
        url: manga.url,
        title: decodeEntities(project.title?.rendered ?? ''),
        author: info.roteiro || undefined,
        artist: info.arte || undefined,
        genres: (info.generos ?? []).map((g) => g.nome ?? ''),
        status: toStatus(info.status_scan?.nome ?? ''),
        description: `${htmlToText(project.content?.rendered ?? '')}\n\nTítulo original: ${info.titulo_pais_origem ?? ''}\nSerialização: ${info.serializacao ?? ''}`,
        thumbnailUrl: project.thumbnail || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const result = await get<ChapterDto[]>(
        `${API}/capitulos?projeto=${encodeURIComponent(slug)}&per_page=1000&order=desc&orderby=sequencia&_fields=nome_capitulo,post_id,slug,data_insercao`,
      );
      if (result.body.length === 0) throw new Error('Capítulos não encontrados.');
      // Count the project views, requested by the scanlator.
      if (result.body[0]?.post_id) countView(result.body[0].post_id);
      return result.body.map((c) => ({
        url: `/leitor-online/projeto/${slug}/${c.slug}/`,
        name: c.nome_capitulo ?? '',
        scanlator: SCANLATOR,
        uploadedAt: parseDate(c.data_insercao, 'yyyy-MM-dd HH:mm:ss'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const slug = slugOf(chapter.url);
      const chapterSlug = chapter.url.replace(/\/$/, '').split('/').pop() ?? '';
      const result = (
        await get<ChapterDto>(`${API}/capitulos/${slug}/${chapterSlug}?_fields=id_capitulo,paginas,post_id`)
      ).body;
      const pages = result.paginas ?? [];
      if (pages.length === 0) return [];
      // Count the project and chapter views, requested by the scanlator.
      if (result.post_id) countView(result.post_id, result.id_capitulo);
      const chapterUrl = `${BASE_URL}/leitor-online/projeto/${slug}/${chapterSlug}`;
      return pages.map((imageUrl, index) => ({ index, imageUrl, url: chapterUrl }));
    },
    imageHeaders: () => imageHeaders,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/projeto\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/projeto/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
