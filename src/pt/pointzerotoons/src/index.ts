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
import { USER_AGENT, hostOf, relativeUrl, selectIgnoreCase, withQuery } from './common/utils';

const BASE_URL = 'https://kitsuneyako.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// Listing cards don't expose the type, so novels are only recognisable by the "(NOVEL)" marker in their titles.
const NOVEL_MARKER = '(novel)';

const SORTS = [
  { value: 'popular', label: 'Popular' },
  { value: 'updated', label: 'Atualizados' },
  { value: 'title', label: 'Título (A-Z)' },
];
const STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Hiatus', label: 'Hiatus' },
  { value: 'Dropped', label: 'Dropped' },
  { value: 'on-going', label: 'on-going' },
  { value: 'Canceled', label: 'Canceled' },
];
const TYPES = [
  { value: '', label: 'Todos' },
  { value: 'Manga', label: 'Manga' },
  { value: 'Manhwa', label: 'Manhwa' },
  { value: 'Manhua', label: 'Manhua' },
  { value: 'One Shot', label: 'One Shot' },
  { value: 'Comic', label: 'Comic' },
];
const GENRES = [
  { value: '', label: 'Todos' },
  { value: '4-koma', label: '4-koma' },
  { value: 'acao', label: 'Ação' },
  { value: 'acao-social', label: 'Ação Social' },
  { value: 'action', label: 'Action' },
  { value: 'adaptacao', label: 'Adaptação' },
  { value: 'adulto', label: 'Adulto' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'alienigenas', label: 'Alienígenas' },
  { value: 'aliens', label: 'Aliens' },
  { value: 'amnesia', label: 'Amnésia' },
  { value: 'amor-entre-garotas', label: 'Amor Entre Garotas' },
  { value: 'animais', label: 'Animais' },
  { value: 'animal', label: 'Animal' },
  { value: 'anti-heroi', label: 'Antí-Herói' },
  { value: 'antologia', label: 'Antologia' },
  { value: 'apocalipse', label: 'Apocalipse' },
  { value: 'apocaliptico', label: 'Apocalíptico' },
  { value: 'argos', label: 'Argos' },
  { value: 'armas', label: 'Armas' },
  { value: 'artes-marciais', label: 'Artes Marciais' },
  { value: 'aventura', label: 'Aventura' },
  { value: 'basquete', label: 'Basquete' },
  { value: 'carros', label: 'Carros' },
  { value: 'casamento', label: 'casamento' },
  { value: 'colegial', label: 'colegial' },
  { value: 'colorido', label: 'colorido' },
  { value: 'comedia', label: 'Comédia' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'conspiracao', label: 'Conspiração' },
  { value: 'cooking', label: 'Cooking' },
  { value: 'corrida', label: 'corrida' },
  { value: 'cotidiano', label: 'Cotidiano' },
  { value: 'cowboys', label: 'Cowboys' },
  { value: 'cozinha', label: 'Cozinha' },
  { value: 'crime', label: 'Crime' },
  { value: 'culinaria', label: 'Culinária' },
  { value: 'cultivo', label: 'Cultivo' },
  { value: 'danca', label: 'Dança' },
  { value: 'delinquentes', label: 'Delinquentes' },
  { value: 'delinquents', label: 'Delinquents' },
  { value: 'deliquentes', label: 'Deliquentes' },
  { value: 'demonio', label: 'Demônio' },
  { value: 'demonios', label: 'Demônios' },
  { value: 'doujinshi', label: 'Doujinshi' },
  { value: 'dragoes', label: 'Dragões' },
  { value: 'drama', label: 'Drama' },
  { value: 'dungeon', label: 'Dungeon' },
  { value: 'ecchi', label: 'Ecchi' },
  { value: 'erotico', label: 'erotico' },
  { value: 'escolar', label: 'Escolar' },
  { value: 'escritorio', label: 'Escritório' },
  { value: 'esporte', label: 'Esporte' },
  { value: 'esportes', label: 'Esportes' },
  { value: 'exploracao', label: 'Exploração' },
  { value: 'familia', label: 'Família' },
  { value: 'fantasia', label: 'Fantasia' },
  { value: 'fantasia-sombria', label: 'Fantasia Sombria' },
  { value: 'fantasma', label: 'Fantasma' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'ficcao', label: 'Ficção' },
  { value: 'ficcao-cientifica', label: 'Ficção Científica' },
  { value: 'filme-de-acao', label: 'Filme de ação' },
  { value: 'filosofico', label: 'Filosófico' },
  { value: 'full-color', label: 'Full color' },
  { value: 'gamelit', label: 'GameLit' },
  { value: 'games-tradicionais', label: 'Games tradicionais' },
  { value: 'gangues', label: 'Gangues' },
  { value: 'garotas-magicas', label: 'Garotas Mágicas' },
  { value: 'garotas-monstro', label: 'Garotas Monstro' },
  { value: 'gender-bender', label: 'Gender Bender' },
  { value: 'girlslove', label: "Girls'Love" },
  { value: 'gore', label: 'Gore' },
  { value: 'gyaru', label: 'Gyaru' },
  { value: 'habilidades', label: 'Habilidades' },
  { value: 'harem', label: 'Harém' },
  { value: 'harem-reverso', label: 'Harém Reverso' },
  { value: 'historica', label: 'Histórica' },
  { value: 'historico', label: 'Histórico' },
  { value: 'horro', label: 'horro' },
  { value: 'horror', label: 'Horror' },
  { value: 'isek', label: 'isek' },
  { value: 'isekai', label: 'Isekai' },
  { value: 'jogo', label: 'Jogo' },
  { value: 'jogos', label: 'Jogos' },
  { value: 'jogos-de-video', label: 'Jogos de vídeo' },
  { value: 'josei', label: 'Josei' },
  { value: 'loli', label: 'Loli' },
  { value: 'long-strip', label: 'Long Strip' },
  { value: 'luta', label: 'Luta' },
  { value: 'maduro', label: 'Maduro' },
  { value: 'mafia', label: 'Máfia' },
  { value: 'magia', label: 'Magia' },
  { value: 'manhua', label: 'Manhua' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'martial-arts', label: 'Martial Arts' },
  { value: 'mecha', label: 'Mecha' },
  { value: 'medicina', label: 'Medicina' },
  { value: 'medico', label: 'Médico' },
  { value: 'medieval', label: 'Medieval' },
  { value: 'militar', label: 'Militar' },
  { value: 'misterio', label: 'Mistério' },
  { value: 'mitologia', label: 'Mitologia' },
  { value: 'monstros', label: 'Monstros' },
  { value: 'mundo-virtual', label: 'Mundo Virtual' },
  { value: 'murim', label: 'Murim' },
  { value: 'musica', label: 'Música' },
  { value: 'mystery', label: 'Mystery' },
  { value: 'necromancia', label: 'Necromancia' },
  { value: 'ninja', label: 'Ninja' },
  { value: 'office-workers', label: 'Office Workers' },
  { value: 'one', label: 'One' },
  { value: 'oneshot', label: 'Oneshot' },
  { value: 'pets', label: 'Pets' },
  { value: 'policial', label: 'Policial' },
  { value: 'pos-apocaliptico', label: 'Pós-Apocalíptico' },
  { value: 'premiado', label: 'Premiado' },
  { value: 'protagonista-feminina', label: 'protagonista Feminina' },
  { value: 'protagonista-genio', label: 'Protagonista gênio' },
  { value: 'protagonista-masculino', label: 'Protagonista Masculino' },
  { value: 'psicologico', label: 'Psicológico' },
  { value: 'psychological', label: 'Psychological' },
  { value: 'rakugo', label: 'Rakugo' },
  { value: 'realidade-virtual', label: 'Realidade Virtual' },
  { value: 'reencarnacao', label: 'Reencarnação' },
  { value: 'regressao', label: 'Regressão' },
  { value: 'regressao-deslizamento-temporal', label: 'Regressão/Deslizamento Temporal' },
  { value: 'reincarnation', label: 'Reincarnation' },
  { value: 'retorno', label: 'Retorno' },
  { value: 'romance', label: 'Romance' },
  { value: 'samurai', label: 'Samurai' },
  { value: 'sangue', label: 'Sangue' },
  { value: 'sci-fi', label: 'SCI-FI' },
  { value: 'seinen', label: 'Seinen' },
  { value: 'shonen', label: 'shonen' },
  { value: 'shota', label: 'Shota' },
  { value: 'shoujo', label: 'Shoujo' },
  { value: 'shounen', label: 'Shounen' },
  { value: 'shounen-tipo', label: 'Shounen Tipo' },
  { value: 'sistema', label: 'Sistema' },
  { value: 'sistema-de-jogo', label: 'Sistema de Jogo' },
  { value: 'slice-of-life', label: 'Slice of Life' },
  { value: 'smut', label: 'Smut' },
  { value: 'sobrenatural', label: 'Sobrenatural' },
  { value: 'sobrevivencia', label: 'Sobrevivência' },
  { value: 'steampunk', label: 'Steampunk' },
  { value: 'sugestivo', label: 'Sugestivo' },
  { value: 'super-poderes', label: 'Super Poderes' },
  { value: 'super-heroi', label: 'Super-Herói' },
  { value: 'supernatural', label: 'Supernatural' },
  { value: 'survival', label: 'Survival' },
  { value: 'suspense', label: 'Suspense' },
  { value: 'terror', label: 'Terror' },
  { value: 'thriller', label: 'Thriller' },
  { value: 'tira-longa', label: 'Tira Longa' },
  { value: 'tiro', label: 'Tiro' },
  { value: 'trabalhadores-de-escritorio', label: 'Trabalhadores de Escritório' },
  { value: 'tragedia', label: 'Tragédia' },
  { value: 'tragedias', label: 'Tragédias' },
  { value: 'transmigracao', label: 'Transmigração' },
  { value: 'tregedia', label: 'Tregédia' },
  { value: 'triangulo-amoroso', label: 'Triângulo Amoroso' },
  { value: 'troca-de-genero', label: 'Troca de Gênero' },
  { value: 'um-recorte-da-vida', label: 'Um recorte da vida' },
  { value: 'vampiros', label: 'Vampiros' },
  { value: 'viagem-dimensional', label: 'Viagem Dimensional' },
  { value: 'viagem-no-tempo', label: 'Viagem no Tempo' },
  { value: 'vida', label: 'Vida' },
  { value: 'vida-escolar', label: 'Vida Escolar' },
  { value: 'video-games', label: 'Video Games' },
  { value: 'viking', label: 'Viking' },
  { value: 'vila', label: 'Vilã' },
  { value: 'vinganca', label: 'Vingança' },
  { value: 'violencia', label: 'violencia' },
  { value: 'web-comic', label: 'Web Comic' },
  { value: 'webcomic', label: 'Webcomic' },
  { value: 'webtoon', label: 'Webtoon' },
  { value: 'wuxia', label: 'Wuxia' },
  { value: 'xianxia', label: 'Xianxia' },
  { value: 'xuanhuan', label: 'Xuanhuan' },
  { value: 'yaoi', label: 'Yaoi' },
  { value: 'yuri', label: 'Yuri' },
  { value: 'zombie', label: 'Zombie' },
  { value: 'zumbi', label: 'Zumbi' },
];

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

function listUrl(page: number, params: Record<string, string>): string {
  const base = `${BASE_URL}/manga/${page > 1 ? `page/${page}/` : ''}`;
  return withQuery(base, params);
}

async function list(url: string): Promise<MangaPage> {
  const doc = await load(url);
  const items: MangaSummary[] = [];
  for (const card of doc.select('article.inkra-catalog-card')) {
    const href = card.selectFirst('a.inkra-catalog-card__media')?.absUrl('href');
    const title = card.selectFirst('h3 a')?.text();
    if (!href || !title || title.toLowerCase().includes(NOVEL_MARKER)) continue;
    items.push({ url: relativeUrl(href), title, thumbnailUrl: card.selectFirst('img')?.absUrl('src') });
  }
  return { items, hasNextPage: doc.selectFirst('a.next.page-numbers') !== null };
}

function search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  const str = (id: string, fallback: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : fallback);
  const params: Record<string, string | undefined> = { order: str('sort', 'popular') };
  if (query) params.s = query;
  for (const key of ['status', 'type', 'genre']) if (str(key, '')) params[key] = str(key, '');
  return list(listUrl(page, params as Record<string, string>));
}

const STATUS_MAP: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  'on-going': 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  dropped: 'cancelled',
  canceled: 'cancelled',
};

const select = (id: string, label: string, options: { value: string; label: string }[]): Filter => ({
  type: 'select',
  id,
  label,
  options,
  default: options[0]!.value,
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search('', page, {}),
    getLatest: (page) => list(listUrl(page, { order: 'updated' })),
    getFilters: (): Filter[] => [
      select('sort', 'Ordenar por', SORTS),
      select('status', 'Status', STATUSES),
      select('type', 'Tipo', TYPES),
      select('genre', 'Gênero', GENRES),
    ],
    search,
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const detail = (label: string) => {
        return (
          selectIgnoreCase(doc, `dl.inkra-series-detail-list dt:contains(${label}) + *`)[0]?.text().trim() || undefined
        );
      };
      const type = detail('Tipo');
      const status = detail('Status')?.toLowerCase();
      return {
        url: manga.url,
        title: doc.selectFirst('h1.inkra-page-title')?.text() ?? manga.title,
        thumbnailUrl: doc.selectFirst('.inkra-series-cover img')?.absUrl('src') ?? manga.thumbnailUrl,
        description: doc.selectFirst('.inkra-series-synopsis')?.text().trim() || undefined,
        author: detail('Autor'),
        genres: type ? [type.charAt(0).toUpperCase() + type.slice(1)] : [],
        status: (status && STATUS_MAP[status]) || 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const chapters: Chapter[] = [];
      for (const item of doc.select('article.inkra-chapter-item')) {
        const href = item.selectFirst('a.inkra-chapter-item__link')?.absUrl('href');
        if (!href) continue;
        const number = Number.parseFloat(item.attr('data-number') ?? '');
        chapters.push({
          url: relativeUrl(href),
          name: item.selectFirst('.inkra-chapter-item__label')?.text() ?? 'Chapter',
          number: Number.isNaN(number) ? undefined : number,
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(BASE_URL + chapter.url);
      return doc
        .select('figure.inkra-reader-page img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/manga\/[^/]+\/?$/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
