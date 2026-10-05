import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://teamscanr.fr';
const CDN_URL = 'https://cdn.teamscanr.fr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Serie {
  slug: string;
  title: string;
  description: string;
  artist: string;
  author: string;
  cover: string;
  os?: boolean;
  chapters: Record<string, { title: string; volume: string; last_updated: string; groups: Record<string, string> }>;
  completed?: boolean;
  konami?: boolean;
}

const get = async <T>(url: string): Promise<T> => JSON.parse((await http.get(url, { headers })).body) as T;

const fetchIndex = () => get<Record<string, string>>(`${CDN_URL}/index.json`);
const seriesCache = new Map<string, Serie>();

async function fetchSeriesData(filename: string): Promise<Serie> {
  let serie = seriesCache.get(filename);
  if (!serie) {
    serie = await get<Serie>(`${CDN_URL}/${filename}`);
    seriesCache.set(filename, serie);
  }
  return serie;
}

const toSummary = (s: Serie): MangaSummary => ({
  url: `/${s.slug}`,
  title: `${s.konami ? '[+18] ' : ''}${s.title}`,
  thumbnailUrl: s.cover,
});

const slugOf = (url: string) => url.replace(/^\/+/, '').split('/')[0] ?? '';

function checkbox(id: string, label: string): Filter {
  return { type: 'checkbox', id, label, default: true };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search('', page, {}),
    search: (query, page, filters) => search(query, page, filters),
    getFilters: (): Filter[] => [
      {
        type: 'group',
        id: 'type',
        label: 'Type',
        filters: [checkbox('type.os', 'OS'), checkbox('type.series', 'Séries')],
      },
      {
        type: 'group',
        id: 'status',
        label: 'Status',
        filters: [checkbox('status.completed', 'Terminé'), checkbox('status.ongoing', 'En cours')],
      },
      {
        type: 'group',
        id: 'adult',
        label: 'Adulte ?',
        filters: [checkbox('adult.18', '+18'), checkbox('adult.normal', 'Normal')],
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const serie = await fetchSeriesData((await fetchIndex())[slugOf(manga.url)]!);
      return {
        ...toSummary(serie),
        description: serie.description,
        artist: serie.artist,
        author: serie.author,
        status: serie.os || serie.completed ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const serie = await fetchSeriesData((await fetchIndex())[slugOf(manga.url)]!);
      return Object.entries(serie.chapters)
        .map(([number, data]): Chapter => {
          const title = data.title;
          const name = !serie.os
            ? `${data.volume.trim() ? `Vol. ${data.volume} ` : ''}Ch. ${number}${title.trim() ? ` – ${title}` : ''}`
            : title.trim()
              ? `One Shot – ${title}`
              : 'One Shot';
          const parsed = Number.parseFloat(number);
          return {
            url: `/${serie.slug}/${number.replace('.', '-')}`,
            name,
            number: Number.isNaN(parsed) ? -1 : parsed,
            scanlator: Object.keys(data.groups)[0],
            uploadedAt: Number(data.last_updated) * 1000 || undefined,
          };
        })
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [slug, chapterId] = chapter.url.replace(/^\/+/, '').split('/');
      const serie = await fetchSeriesData((await fetchIndex())[slug!] ?? '');
      const details = serie.chapters[(chapterId ?? '').replace('-', '.')];
      if (!details) throw new Error('Chapter not found');
      const proxy = Object.values(details.groups)[0];
      const images = await get<string[]>(`https://cubari.moe${proxy}`);
      return images.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/teamscanr\.fr\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/${slug}`, title: '' } : null;
    },
  }),
});

async function search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
  const on = (id: string) => filters[id] !== false;
  const all = (prefix: string, ids: string[]) => ids.every((id) => !on(`${prefix}.${id}`));
  const index = await fetchIndex();
  const entries = Object.values(index);
  // Every series file is read to filter on its fields (like the app's Tachiyomi version does).
  const series = await Promise.all(entries.map(fetchSeriesData));
  const items: MangaSummary[] = [];
  for (const serie of series) {
    if (query.trim() && !serie.title.toLowerCase().includes(query.trim().toLowerCase())) continue;
    const typeOk = (serie.os && on('type.os')) || (!serie.os && on('type.series')) || all('type', ['os', 'series']);
    const completed = !!(serie.os || serie.completed);
    const statusOk =
      (!completed && on('status.ongoing')) ||
      (completed && on('status.completed')) ||
      all('status', ['ongoing', 'completed']);
    const adultOk =
      (serie.konami && on('adult.18')) || (!serie.konami && on('adult.normal')) || all('adult', ['18', 'normal']);
    if (typeOk && statusOk && adultOk) items.push(toSummary(serie));
  }
  return { items, hasNextPage: false };
}
