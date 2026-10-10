import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://www.hq-now.com';
const GRAPHQL_URL = 'https://admin.hq-now.com/graphql';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface ComicDto {
  id: number;
  name: string;
  hqCover?: string | null;
  synopsis?: string | null;
  publisherName?: string | null;
  status?: string | null;
  capitulos?: { id: number; name: string; number: string }[];
}

async function graphql<T>(query: string, operationName: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await http.post<{ data: T; errors?: { message: string }[] }>(
    GRAPHQL_URL,
    { json: { operationName, variables, query } },
    { headers, responseType: 'json' },
  );
  if (!response.body.data) throw new Error(response.body.errors?.[0]?.message ?? 'GraphQL error');
  return response.body.data;
}

function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9\s]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

const summary = (c: ComicDto): MangaSummary => ({
  url: `/hq/${c.id}/${toSlug(c.name)}`,
  title: c.name,
  thumbnailUrl: c.hqCover || undefined,
});

const idOf = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const data = await graphql<{ getHqsByFilters: ComicDto[] }>(
        `
          query getHqsByFilters($orderByViews: Boolean, $limit: Int, $publisherId: Int, $loadCovers: Boolean) {
            getHqsByFilters(
              orderByViews: $orderByViews
              limit: $limit
              publisherId: $publisherId
              loadCovers: $loadCovers
            ) {
              id
              name
              editoraId
              status
              publisherName
              hqCover
              synopsis
              updatedAt
            }
          }
        `,
        'getHqsByFilters',
        { orderByViews: true, loadCovers: true, limit: 300 },
      );
      return { items: data.getHqsByFilters.map(summary), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const data = await graphql<{ getRecentlyUpdatedHqs: ComicDto[] }>(
        `
          query getRecentlyUpdatedHqs {
            getRecentlyUpdatedHqs {
              name
              hqCover
              synopsis
              id
              updatedAt
              updatedChapters
            }
          }
        `,
        'getRecentlyUpdatedHqs',
      );
      return { items: data.getRecentlyUpdatedHqs.map(summary), hasNextPage: false };
    },
    async search(query: string): Promise<MangaPage> {
      const data = await graphql<{ getHqsByName: ComicDto[] }>(
        `
          query getHqsByName($name: String!) {
            getHqsByName(name: $name) {
              id
              name
              editoraId
              status
              publisherName
              impressionsCount
            }
          }
        `,
        'getHqsByName',
        { name: query },
      );
      return { items: data.getHqsByName.map(summary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const comic = await byId(manga.url);
      return {
        url: manga.url,
        title: comic.name,
        thumbnailUrl: comic.hqCover || undefined,
        description: comic.synopsis ?? '',
        author: comic.publisherName || undefined,
        status: toStatus(comic.status ?? ''),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const comic = await byId(manga.url);
      return (comic.capitulos ?? [])
        .map((c) => ({
          name: `#${c.number}${c.name ? ` - ${c.name}` : ''}`,
          url: `/hq-reader/${comic.id}/${toSlug(comic.name)}/chapter/${c.id}/page/1`,
          number: Number.parseFloat(c.number) || undefined,
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = Number(/\/chapter\/(\d+)/.exec(chapter.url)?.[1]);
      const data = await graphql<{ getChapterById: { pictures: { pictureUrl: string }[] } }>(
        `
          query getChapterById($chapterId: Int!) {
            getChapterById(chapterId: $chapterId) {
              name
              number
              oneshot
              pictures {
                pictureUrl
              }
            }
          }
        `,
        'getChapterById',
        { chapterId },
      );
      return data.getChapterById.pictures.map((p, index) => ({ index, imageUrl: p.pictureUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/hq\/(\d+)(\/[^/?#]*)?/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/hq/${match[2]}${match[3] ?? ''}`, title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});

async function byId(url: string): Promise<ComicDto> {
  const data = await graphql<{ getHqsById: ComicDto[] }>(
    `
      query getHqsById($id: Int!) {
        getHqsById(id: $id) {
          id
          name
          synopsis
          editoraId
          status
          publisherName
          hqCover
          impressionsCount
          capitulos {
            name
            id
            number
          }
        }
      }
    `,
    'getHqsById',
    { id: Number(idOf(url)) },
  );
  const comic = data.getHqsById[0];
  if (!comic) throw new Error('HQ não encontrada');
  return comic;
}

function toStatus(status: string): MangaStatus {
  return status === 'Concluído' ? 'completed' : status === 'Em Andamento' ? 'ongoing' : 'unknown';
}
