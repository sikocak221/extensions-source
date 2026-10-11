import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://manhastro.net';
const API_URL = 'https://api2.manhastro.net';
const ENGLISH_TITLE_PREF = 'englishTitlePref';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  manga_id: number;
  titulo?: string;
  titulo_brasil?: string | null;
  descricao?: string | null;
  descricao_brasil?: string | null;
  imagem?: string | null;
  generos?: string[];
  status?: string | null;
}

const TYPES: [string, string][] = [
  ['Manhwa', 'manhwa'],
  ['Manhua', 'manhua'],
  ['Manga', 'manga'],
  ['Webtoon', 'webtoon'],
  ['Comic', 'comic'],
];
// The site filters by the lowercase genre name.
const GENRES = [
  '4-koma',
  'Ação',
  'Adaptação',
  'Adaptation',
  'Adulto',
  'Aliens',
  'Animais',
  'Animals',
  'Anthology',
  'Apocalipse',
  'Argos',
  'Artes Marciais',
  'Ativo',
  'Atualização',
  'Auto-publicado',
  'Aventura',
  'Award Winning',
  'BL',
  'Bizarro',
  'Comédia',
  'Completo',
  'Cooking',
  'Crime',
  'Crossdressing',
  'Culinária',
  'Cultivo',
  'Delinquents',
  'Demônios',
  'Deuses',
  'Doujinshi',
  'Drama',
  'Ecchi',
  'Escola',
  'Esporte',
  'Esportes',
  'FKscan',
  'Familia',
  'Fantasia',
  'Ficção Científica',
  'Filosófico',
  'Full Color',
  'Genérico',
  'Gender Bender',
  'Ghosts',
  'Gore',
  'Guerra',
  'Gyaru',
  'Harém',
  'Histórico',
  'Horror',
  'Incest',
  'Isekai',
  'Josei',
  'Kamen Rider',
  'Linha do Tempo',
  'Loli',
  'Long Strip',
  'Luta',
  'Médico',
  'Música',
  'Mafia',
  'Magia',
  'Mecha',
  'Mechas',
  'Militar',
  'Mistério',
  'Moderno',
  'Monster Girls',
  'Monstros',
  'Murim',
  'Music',
  'NextSakura Scan',
  'Ninja',
  'Nitury Scan',
  'Office Workers',
  'Official Colored',
  'One Shot',
  'Oneshot',
  'Police',
  'Policial',
  'Post-Apocalyptic',
  'Psicológico',
  'Reencarnação',
  'Regressão',
  'Reincarnation',
  'Reverse Harem',
  'Romance',
  'Sagrado Império da Britannia',
  'Saint Seiya',
  'Samurai',
  'School Life',
  'Seinen',
  'Sempre ao seu lado Scan',
  'Shota',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Sistema',
  'Slice of Life',
  'Sobrenatural',
  'Sobrevivência',
  'Super Poderes',
  'Super-herói',
  'Supernatural',
  'Survival',
  'Suspense',
  'Terror',
  'Thriller',
  'Time Travel',
  'Tokusatsu',
  'Tragédia',
  'Vampires',
  'Vampiros',
  'Vida Escolar',
  'Video Games',
  'Villainess',
  'Vingança',
  'Volta no Tempo',
  'Wuxia',
  'Yaoi',
  'Yuri',
  'Zombies',
  'jogos',
  'shonen ai',
];
const SORTS = [
  { value: 'views', label: 'Mais Popular' },
  { value: 'ultimo_capitulo', label: 'Últimas Atualizações' },
  { value: 'data', label: 'Mais Recente' },
  { value: 'titulo', label: 'Título (A-Z)' },
];
// Order of each sort when it is not toggled.
const SORT_ASCENDING = new Set(['titulo']);

/** The api sometimes prefixes its json with junk. */
async function api<T>(path: string): Promise<T> {
  const response = await http.get(API_URL + path, { headers });
  const body = response.body
    .replace(/^﻿/, '')
    .replace(/^\)\]\}'/, '')
    .replace(/^,/, '')
    .replace(/^_/, '')
    .trim();
  return JSON.parse(body) as T;
}

function summary(m: MangaDto): MangaSummary {
  const english = prefs.get<boolean>(ENGLISH_TITLE_PREF) === true;
  const displayTitle = m.titulo_brasil?.trim() ? m.titulo_brasil : (m.titulo ?? '');
  const image = m.imagem;
  return {
    url: `/manga/${m.manga_id}`,
    title: english ? (m.titulo?.trim() ? m.titulo : displayTitle) : displayTitle,
    thumbnailUrl: image ? (image.startsWith('http') ? image : `https://${image}`) : undefined,
  };
}

const idOf = (url: string) => url.split('/').pop() ?? '';

const checkedValues = (filters: FilterState, prefix: string) =>
  Object.entries(filters)
    .filter(([id, v]) => id.startsWith(prefix) && v === true)
    .map(([id]) => id.slice(prefix.length));

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: ENGLISH_TITLE_PREF,
      label: 'Títulos em inglês',
      description:
        'Use títulos em inglês como principal quando disponível. (Requer ativar "Atualizar os títulos dos mangás da biblioteca para corresponder à fonte" em "Avançado")',
      default: false,
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const result = await api<{ data: MangaDto[] }>('/rank/diario');
      return { items: result.data.map(summary), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const result = await api<{ data: MangaDto[] }>('/lancamentos');
      const seen = new Set<number>();
      const items = result.data.filter((m) => !seen.has(m.manga_id) && seen.add(m.manga_id));
      return { items: items.map(summary), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'sort',
        label: 'Ordenar por',
        options: SORTS,
        default: { value: 'views', ascending: false },
      },
      { type: 'separator' },
      {
        type: 'group',
        id: 'type',
        label: 'Tipos',
        filters: TYPES.map(([label, value]): Filter => ({ type: 'checkbox', id: `type.${value}`, label })),
      },
      { type: 'separator' },
      {
        type: 'group',
        id: 'genre',
        label: 'Gêneros',
        filters: GENRES.map((label): Filter => ({ type: 'checkbox', id: `genre.${label.toLowerCase()}`, label })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query.trim()) params.push(`nome=${encodeURIComponent(query.trim())}`);
      const sort = (filters.sort as SortValue | undefined) ?? { value: 'views', ascending: false };
      params.push(`sort=${sort.value}`, `order=${sort.ascending !== SORT_ASCENDING.has(sort.value) ? 'asc' : 'desc'}`);
      const types = checkedValues(filters, 'type.');
      if (types.length) params.push(`categoria=${encodeURIComponent(types.join(','))}`);
      const genres = checkedValues(filters, 'genre.');
      if (genres.length) params.push(`genero=${encodeURIComponent(genres.join(','))}`);
      const result = await api<{ data: MangaDto[]; meta?: { has_more?: boolean } }>(`/dados?${params.join('&')}`);
      return { items: result.data.map(summary), hasNextPage: result.meta?.has_more ?? false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const result = await api<{ data: MangaDto[] }>(`/dados?manga_id=${idOf(manga.url)}`);
      const m = result.data[0];
      if (!m) throw new Error('Manga not found');
      return {
        ...summary(m),
        description: m.descricao_brasil?.trim() ? m.descricao_brasil : (m.descricao ?? undefined),
        genres: m.generos ?? [],
        status: m.status === 'on-going' ? 'ongoing' : m.status === 'end' ? 'completed' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const result = await api<{ data: { capitulo_id: number; capitulo_nome: string; capitulo_data: string }[] }>(
        `/dados/${idOf(manga.url)}`,
      );
      return result.data
        .map((c) => ({
          url: `/capitulo/${c.capitulo_id}`,
          name: c.capitulo_nome,
          number: Number(/(\d+(?:\.\d+)?)/.exec(c.capitulo_nome)?.[1] ?? -1),
          uploadedAt: parseDate(c.capitulo_data, 'yyyy-M-d H:mm:ss'),
        }))
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await api<{ data: { chapter?: { baseUrl: string; hash: string; data: string[] } } }>(
        `/paginas/${idOf(chapter.url)}`,
      );
      const data = result.data.chapter;
      if (!data) return [];
      return data.data.map((name, index) => ({ index, imageUrl: `${data.baseUrl}/${data.hash}/${name}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
