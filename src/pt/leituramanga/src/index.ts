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
import { USER_AGENT, findRscObject, hostOf, selectFirstIgnoreCase } from './common/utils';

const BASE_URL = 'https://leituramanga.net';
const API_URL = 'https://api.leituramanga.net';
const CDN_URL = 'https://cdn.leituramanga.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  _id: string;
  title: string;
  slug: string;
  author?: string | null;
  description?: string | null;
  status?: number | null;
  genres?: { name: string }[] | null;
  alternativeTitles?: string[] | null;
}

const GENRES: [string, string][] = [
  ['Todos', ''],
  ['Romance', '680b9c9f94036afb098c9496'],
  ['Fantasia', '680b9c9f94036afb098c9493'],
  ['Shoujo', '680b9c3d94036afb098c9464'],
  ['Drama', '680b9c3c94036afb098c945e'],
  ['Historico', '680b9ca494036afb098c94ab'],
  ['Manhwa', '680c51ab3720580a3d51c003'],
  ['Comedia', '680b9c9294036afb098c9479'],
  ['Josei', '680b9ca494036afb098c94ae'],
  ['Ação', '680b9c9294036afb098c9473'],
  ['Aventura', '680bbfb23720580a3d519cc2'],
  ['Magia', '680ba2e1881ffa93cedbf929'],
  ['Sobrenatural', '680b9ca594036afb098c94b8'],
  ['Reencarnação', '680b9c3c94036afb098c9461'],
  ['Shounen', '680b9c9394036afb098c9480'],
  ['Isekai', '680bbb2f612fa8d9c95306f4'],
  ['Mistério', '680b9ca594036afb098c94b1'],
  ['Artes Marciais', '680b9c9294036afb098c9476'],
  ['Familia', '680ba2e1881ffa93cedbf926'],
  ['Psicológico', '680be3c93720580a3d51a5dd'],
  ['Adulto', '680bb39c01897055e493d58e'],
  ['Escolar', '680c582c3720580a3d51c1b3'],
  ['Slice of Life', '680bc3393720580a3d519d00'],
  ['Seinen', '680bafade71bcb4e5776b62c'],
  ['+18', '680bec6f3720580a3d51a83a'],
  ['Tragedia', '680bd6443720580a3d51a2ed'],
  ['Demonios', '680b9c9394036afb098c947c'],
  ['Harem', '680bbc85612fa8d9c9530773'],
  ['Vida escolar', '680bc3393720580a3d519d03'],
  ['Smut', '680bec2e3720580a3d51a81f'],
  ['Shoujo Ai', '680b9ca594036afb098c94b5'],
  ['Yaoi', '680d89eb17c65f3600568d03'],
  ['Vingança', '680cbfab46c075b3b585d074'],
  ['Sobrevivencia', '680c22743720580a3d51b596'],
  ['Viagem no tempo', '680c2b353720580a3d51b79f'],
  ['Realeza', '680c09953720580a3d51afc3'],
  ['Manhua', '680c28ab3720580a3d51b6da'],
  ['Completo', '680d9cd817c65f360056a114'],
  ['Demônio', '680d1da917c65f36005619b1'],
  ['Maduro', '680c19563720580a3d51b312'],
  ['Regressão', '680c22743720580a3d51b591'],
  ['Adaptação', '680c2da43720580a3d51b81d'],
  ['Estratégia', '680e7e8919e61865daa97253'],
  ['Ecchi', '680ba5b2e894c590bda862a5'],
  ['Harém Reverso', '680d22e317c65f3600561fc6'],
  ['Época', '680c4f7e3720580a3d51bf79'],
  ['Moderno', '680d30e717c65f3600562eb2'],
  ['Sistema', '680e7eb619e61865daa9729a'],
  ['Finalizado', '680d939217c65f3600569626'],
  ['Webtoon', '680f2ec719e61865daaa3c83'],
  ['Vilã', '680c09953720580a3d51afca'],
  ['Murim', '680ea72f19e61865daa9a357'],
  ['Time Travel', '680c3c453720580a3d51bb25'],
  ['Obsceno', '680c19563720580a3d51b315'],
  ['Colegial', '680e922319e61865daa989e5'],
  ['Sci-Fi', '680da41417c65f360056a73c'],
  ['Ficção Científica', '690a159576bc80ff0421a73a'],
  ['musical', '680c3cd53720580a3d51bb58'],
  ['Gender Bender', '680d81bb17c65f36005684e4'],
  ['Apocalipse', '680e810519e61865daa97513'],
  ['Horror', '680eaa3e19e61865daa9a898'],
  ['Yuri', '680c4e043720580a3d51bf1f'],
  ['Esportes', '680d9ba617c65f360056a01d'],
  ['Overpowered', '680e7f5e19e61865daa97345'],
  ['Jogo', '680d816317c65f360056843c'],
  ['Triângulo Amoroso', '680da41517c65f360056a740'],
  ['Mulher Overpower', '6910ae7e7351418c61c1513a'],
  ['Erótico', '6925bfcbad1e8b3e82d91dd0'],
  ['Younger Man', '6925bfcbad1e8b3e82d91dd2'],
  ['Cultivo', '680f65aa19e61865daaa56a2'],
  ['Gore', '680eaa3e19e61865daa9a895'],
  ['Super Poderes', '680e781319e61865daa969ca'],
  ['Policial', '680eaa3e19e61865daa9a89c'],
  ['Ação Social', '690b64adb7b932cff6fffe68'],
  ['Fatia da Vida', '690a2e9576bc80ff044a1a3b'],
  ['Terror', '690a2fc776bc80ff044c17a8'],
  ['Vida Adulta', '680e008f74096432d115796a'],
  ['Older Woman', '6925bfcbad1e8b3e82d91dd4'],
  ['Estudante', '680e008e74096432d1157956'],
  ['Vampiro', '680d338917c65f36005631fb'],
  ['Político', '680df96674096432d11570e5'],
  ['Vampiros', '680d645317c65f36005663c5'],
  ['Bi', '680da41317c65f360056a731'],
  ['Anjo', '680d9d1817c65f360056a146'],
  ['NSFW', '680e008e74096432d1157965'],
  ['Parte da Vida', '69059cf3843134a734cae835'],
];
const STATUSES: [string, string][] = [
  ['Todos', ''],
  ['Em andamento', 'Ongoing'],
  ['Completo', 'Completed'],
];
const SORTS: [string, string][] = [
  ['Atualização', 'time'],
  ['Visualizações', 'view'],
  ['Avaliação', 'rate'],
];

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

async function api<T>(url: string): Promise<T> {
  const response = await http.get<T>(url, { headers, responseType: 'json' });
  if (response.status === 403) throw new Error('Abra primeiramente algum mangá ou qualquer capítulo no navegador');
  if (response.status === 429) throw new Error('Limite do site atingido. Aguarde alguns segundos.');
  return response.body;
}

const summary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.slug}`,
  title: m.title,
  thumbnailUrl: `${CDN_URL}/${m.slug}/cover-md.webp`,
});

async function list(query: string): Promise<MangaPage> {
  const result = await api<{ data: { data: MangaDto[]; pagination: { page: number; totalPage: number } } }>(
    `${API_URL}/api/manga/?${query}`,
  );
  return {
    items: result.data.data.map(summary),
    hasNextPage: result.data.pagination.page < result.data.pagination.totalPage,
  };
}

async function loadPage(url: string) {
  const response = await http.get(url, { headers });
  return { body: response.body, document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`sort=view&limit=24&page=${page}`),
    getLatest: (page) => list(`sort=time&limit=24&page=${page}`),
    getFilters: (): Filter[] => [
      select('genre', 'Gêneros', GENRES),
      select('status', 'Status', STATUSES),
      select('sort', 'Ordenar por', SORTS),
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = ['limit=24', `page=${page}`];
      if (query) params.push(`keyword=${encodeURIComponent(query)}`);
      for (const key of ['genre', 'status', 'sort']) {
        const v = filters[key];
        if (typeof v === 'string' && v) params.push(`${key}=${encodeURIComponent(v)}`);
      }
      return list(params.join('&'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await loadPage(BASE_URL + manga.url);
      const info = (label: string) =>
        selectFirstIgnoreCase(document, `h2:contains(Informações) +div p:contains(${label})`)?.text();
      const statusText = info('Status')?.split(':').slice(1).join(':').trim().toLowerCase();
      const statuses: Record<string, MangaStatus> = {
        'em breve': 'ongoing',
        'em andamento': 'ongoing',
        completo: 'completed',
        cancelado: 'cancelled',
        'em pausa': 'hiatus',
      };
      return {
        ...manga,
        title: document.selectFirst('h1')?.text().trim() ?? manga.title,
        description: selectFirstIgnoreCase(document, 'h2:contains(Sinopse) +div p')?.text(),
        author: info('Autor')?.split(':').slice(1).join(':').trim() || undefined,
        genres: document.select('h2 + div > a[href*=genre]').map((e) => e.text().trim()),
        status: statuses[statusText ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { body } = await loadPage(BASE_URL + manga.url);
      const id =
        findRscObject<{ mangaId: string }>(body, (o) => typeof o.mangaId === 'string')?.mangaId ??
        findRscObject<{ manga: { _id: string } }>(
          body,
          (o) => typeof (o.manga as Record<string, unknown> | undefined)?._id === 'string',
        )?.manga._id;
      if (!id) throw new Error('ID do mangá não encontrado');
      const slug = manga.url.split('/').filter(Boolean).pop();
      // The frontend's limit gets the 80/min rate limit instead of the default 3/min.
      const result = await api<{
        data: { data: { chapterNumber: number; title?: string | null; releaseDate: string }[] };
      }>(`${API_URL}/api/chapter/get-by-manga-id?mangaId=${id}&page=1&limit=9007199254740991`);
      return result.data.data.map((c) => {
        const number = String(c.chapterNumber).replace(/\.0$/, '');
        const time = Date.parse(c.releaseDate);
        return {
          name: c.title ?? `Capítulo ${number}`,
          url: `/manga/${slug}/chapter/${number}`,
          number: c.chapterNumber,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { body } = await loadPage(BASE_URL + chapter.url);
      const dto = findRscObject<{ chapter: { images: { url: string }[] } }>(body, (o) => {
        const c = o.chapter as Record<string, unknown> | undefined;
        return Array.isArray(c?.images);
      });
      if (!dto) throw new Error('Páginas não encontradas');
      return dto.chapter.images.map((image, index) => ({ index, imageUrl: `${CDN_URL}/${image.url}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
