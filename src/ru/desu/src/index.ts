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
import { absoluteUrl } from './common/utils';

const BASE_URL = 'https://desu.uno';
const API = `${BASE_URL}/api/manga`;
const LANGUAGE_PREF = 'DesuTitleLanguage';
const headers = { 'User-Agent': 'Mihon (+https://github.com/keiyoushi/extensions-source)' };

const ORDERS = [
  ['popular', 'По популярности'],
  ['updated', 'По обновлению'],
  ['id', 'По добавлению'],
  ['name', 'По алфавиту'],
] as const;
const TYPES: [string, string][] = [
  ['manga', 'Манга'],
  ['manhwa', 'Манхва'],
  ['manhua', 'Маньхуа'],
  ['one_shot', 'Ваншот'],
  ['comics', 'Комикс'],
];
const STATUSES: [string, string][] = [
  ['ongoing', 'Выходит'],
  ['released', 'Издано'],
  ['continued', 'Переводится'],
  ['completed', 'Завершено'],
];
const GENRES: [string, string][] = [
  ['Безумие', 'Dementia'],
  ['Боевые искусства', 'Martial Arts'],
  ['Вампиры', 'Vampire'],
  ['Военное', 'Military'],
  ['Гарем', 'Harem'],
  ['Демоны', 'Demons'],
  ['Детектив', 'Mystery'],
  ['Детское', 'Kids'],
  ['Дзёсей', 'Josei'],
  ['Додзинси', 'Doujinshi'],
  ['Драма', 'Drama'],
  ['Игры', 'Game'],
  ['Исторический', 'Historical'],
  ['Комедия', 'Comedy'],
  ['Космос', 'Space'],
  ['Магия', 'Magic'],
  ['Машины', 'Cars'],
  ['Меха', 'Mecha'],
  ['Музыка', 'Music'],
  ['Пародия', 'Parody'],
  ['Повседневность', 'Slice of Life'],
  ['Полиция', 'Police'],
  ['Приключения', 'Adventure'],
  ['Психологическое', 'Psychological'],
  ['Романтика', 'Romance'],
  ['Самураи', 'Samurai'],
  ['Сверхъестественное', 'Supernatural'],
  ['Сёдзе', 'Shoujo'],
  ['Сёдзе Ай', 'Shoujo Ai'],
  ['Сейнен', 'Seinen'],
  ['Сёнен', 'Shounen'],
  ['Сёнен Ай', 'Shounen Ai'],
  ['Смена пола', 'Gender Bender'],
  ['Спорт', 'Sports'],
  ['Супер сила', 'Super Power'],
  ['Триллер', 'Thriller'],
  ['Ужасы', 'Horror'],
  ['Фантастика', 'Sci-Fi'],
  ['Фэнтези', 'Fantasy'],
  ['Хентай', 'Hentai'],
  ['Школа', 'School'],
  ['Экшен', 'Action'],
  ['Этти', 'Ecchi'],
  ['Юри', 'Yuri'],
  ['Яой', 'Yaoi'],
];

interface MangaDto {
  id: number;
  name: string;
  russian: string;
  kind?: string | null;
  description?: string | null;
  score?: { value?: number | null; votes?: number | null } | null;
  content_rating?: string | null;
  synonyms?: string[] | null;
  cover: { preview?: string | null };
  trans_status?: string | null;
  status?: string | null;
  genres?: { name: string }[] | null;
  authors?: { name: string }[] | null;
}

const stars = (rating: number) =>
  rating > 9.5
    ? '★★★★★'
    : rating > 8.5
      ? '★★★★✬'
      : rating > 7.5
        ? '★★★★☆'
        : rating > 6.5
          ? '★★★✬☆'
          : rating > 5.5
            ? '★★★☆☆'
            : rating > 4.5
              ? '★★✬☆☆'
              : rating > 3.5
                ? '★★☆☆☆'
                : rating > 2.5
                  ? '★✬☆☆☆'
                  : rating > 1.5
                    ? '★☆☆☆☆'
                    : rating > 0.5
                      ? '✬☆☆☆☆'
                      : '☆☆☆☆☆';

const russianTitles = () => prefs.get<string>(LANGUAGE_PREF) === 'rus';

const summary = (m: MangaDto): MangaSummary => ({
  url: `/${m.id}`,
  title: russianTitles() ? m.russian : m.name,
  thumbnailUrl: m.cover.preview || undefined,
});

async function catalog(
  page: number,
  query: string,
  filters: FilterState | undefined,
  order: string,
): Promise<MangaPage> {
  const params: [string, string][] = [
    ['limit', '20'],
    ['page', String(page)],
  ];
  const sort = filters?.order;
  params.push(['order_by', typeof sort === 'string' && sort ? sort : order]);
  const checked = (prefix: string) =>
    Object.entries(filters ?? {})
      .filter(([id, value]) => id.startsWith(`${prefix}.`) && value === true)
      .map(([id]) => id.slice(prefix.length + 1));
  const kinds = checked('type');
  const genres = checked('genre');
  const statuses = checked('status');
  if (kinds.length) params.push(['kinds', kinds.join(',')]);
  if (genres.length) params.push(['genres', genres.join(',')]);
  if (statuses.length) params.push(['status', statuses.join(',')]);
  if (query.trim()) params.push(['search', query.trim()]);
  const response = await http.get<{
    pagination: { current_page: number; last_page: number };
    mangas: MangaDto[];
  }>(`${API}/catalog/?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`, {
    headers,
    responseType: 'json',
  });
  const { pagination, mangas } = response.body;
  return { items: mangas.map(summary), hasNextPage: pagination.last_page > pagination.current_page };
}

function statusOf(m: MangaDto): MangaStatus {
  if (m.trans_status === 'continued') return 'ongoing';
  if (m.trans_status === 'completed') return 'completed';
  if (m.status === 'ongoing') return 'ongoing';
  if (m.status === 'released') return 'completed';
  return 'unknown';
}

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: LANGUAGE_PREF,
      label: 'Выбор языка на обложке',
      options: [
        { value: 'eng', label: 'Английский' },
        { value: 'rus', label: 'Русский' },
      ],
      default: 'eng',
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog(page, '', undefined, 'popular'),
    getLatest: (page) => catalog(page, '', undefined, 'updated'),
    search: (query, page, filters) => catalog(page, query, filters, 'popular'),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'order',
        label: 'Сортировка',
        options: ORDERS.map(([value, label]) => ({ value, label })),
        default: 'popular',
      },
      ...(
        [
          ['type', 'Тип', TYPES],
          ['genre', 'Жанр', GENRES],
          ['status', 'Статус', STATUSES],
        ] as const
      ).map(([id, label, list]): Filter => ({
        type: 'group',
        id,
        label,
        filters: list.map(([text, value]): Filter => ({ type: 'checkbox', id: `${id}.${value}`, label: text })),
      })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get<{ manga: MangaDto }>(`${API}${manga.url}/`, { headers, responseType: 'json' });
      const m = response.body.manga;
      const rating = m.score?.value ?? 0;
      const rawAge = m.content_rating === 'no' ? '' : (m.content_rating?.replace('_plus', '+') ?? '');
      const category =
        { manga: 'Манга', manhwa: 'Манхва', manhua: 'Маньхуа', comics: 'Комикс', one_shot: 'Ваншот' }[m.kind ?? ''] ??
        'Манга';
      const alt = m.synonyms?.length ? `Альтернативные названия:\n${m.synonyms.join(' / ')}\n\n` : '';
      return {
        ...summary(m),
        author: m.authors?.map((a) => a.name).join(', ') || undefined,
        description: `${russianTitles() ? m.name : m.russian}\n${stars(rating)} ${rating} (голосов: ${m.score?.votes ?? 0})\n${alt}${m.description ?? ''}`,
        genres: [category, rawAge, ...(m.genres ?? []).map((g) => g.name)].map((g) => g.trim()).filter(Boolean),
        status: statusOf(m),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get<{
        chapters: {
          id: number;
          volume: string;
          number: string;
          title?: string | null;
          publish_date: number;
          view_url: string;
        }[];
      }>(`${API}${manga.url}/chapters`, { headers, responseType: 'json' });
      return response.body.chapters.map((c): Chapter => {
        const full = `${c.volume}. Глава ${c.number}`;
        return {
          // The reader url the site shows travels in the fragment.
          url: `${manga.url}/chapters/${c.id}#${c.view_url}`,
          name: c.title ? `${full} ${c.title}` : full,
          number: Number.parseFloat(c.number) || undefined,
          uploadedAt: c.publish_date * 1000,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get<{ chapter: { pages: { url: string }[] } }>(`${API}${chapter.url.split('#')[0]}`, {
        headers,
        responseType: 'json',
      });
      return response.body.chapter.pages.map((p, index) => ({ index, imageUrl: p.url }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/desu\.uno\/manga\/(?:[^/?#]*\.)?(\d+)/i.exec(url.trim());
      return match ? { url: `/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) =>
      item.url.includes('#') ? item.url.split('#')[1]! : absoluteUrl(`${BASE_URL}/manga`, item.url),
  }),
});
