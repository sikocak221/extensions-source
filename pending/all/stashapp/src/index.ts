import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';

const PER_PAGE = 25;

const BRIEF_QUERY = `query MangaBrief($filter: FindFilterType) {
  findGalleries(filter: $filter) {
    galleries { id title folder { path } cover { paths { thumbnail } visual_files { __typename } } }
  }
}`;
const DETAILS_QUERY = `query MangaDetails($id: ID!) {
  findGallery(id: $id) {
    id title folder { path } photographer details tags { name } cover { paths { thumbnail } visual_files { __typename } }
  }
}`;
const CHAPTER_QUERY = `query ChapterList($id: ID!) { findGallery(id: $id) { id created_at photographer } }`;
const PAGES_QUERY = `query PageList($id: Int!) {
  findImages(
    filter: { per_page: -1, sort: "path" }
    image_filter: {
      galleries_filter: { id: { value: $id, modifier: EQUALS } }
      files_filter: { image_file_filter: { format: { value: "", modifier: NOT_EQUALS } } }
    }
  ) { images { id } }
}`;

interface Gallery {
  id?: string;
  title?: string;
  folder?: { path?: string } | null;
  photographer?: string | null;
  details?: string | null;
  tags?: { name: string }[];
  cover?: { paths?: { thumbnail?: string }; visual_files?: { __typename?: string }[] } | null;
  created_at?: string;
}

const last = (path: string) =>
  path
    .replace(/[?#].*$/, '')
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .pop() ?? '';

export default defineExtension({
  preferences: () => [
    {
      type: 'text',
      key: 'server_url',
      label: 'Server address',
      description: 'Address of your Stash server',
      default: 'http://localhost:9999',
    },
    {
      type: 'text',
      key: 'api_key',
      label: 'API key',
      description: 'Settings | Security | Authentication | API Key',
      default: '',
    },
  ],

  createSource: () => {
    const baseUrl = () => (prefs.get<string>('server_url') ?? 'http://localhost:9999').trim().replace(/\/+$/, '');
    const authHeaders = (): Record<string, string> => {
      const key = prefs.get<string>('api_key')?.trim();
      return { Accept: 'application/graphql-response+json, application/json', ...(key ? { ApiKey: key } : {}) };
    };

    async function graphQl<T>(operationName: string, query: string, variables: unknown): Promise<T> {
      const response = await http.post<{ data: T; errors?: { message: string }[] }>(
        `${baseUrl()}/graphql`,
        { json: { operationName, query, variables } },
        { headers: authHeaders(), responseType: 'json' },
      );
      if (response.body.errors?.length) throw new Error(response.body.errors[0]!.message);
      return response.body.data;
    }

    const thumbnail = (g: Gallery) =>
      g.cover?.visual_files?.[0]?.__typename === 'ImageFile'
        ? g.cover.paths?.thumbnail?.trim() || undefined
        : undefined;
    const titleOf = (g: Gallery) => g.title?.trim() || (g.folder?.path ? last(g.folder.path) : '') || g.id || '';

    async function brief(
      page: number,
      q: string | undefined,
      sort: string,
      direction: 'ASC' | 'DESC',
    ): Promise<MangaPage> {
      const data = await graphQl<{ findGalleries: { galleries?: Gallery[] } }>('MangaBrief', BRIEF_QUERY, {
        filter: { q, page, per_page: PER_PAGE, sort, direction },
      });
      const items = (data.findGalleries.galleries ?? [])
        .filter((g) => g.id)
        .map((g): MangaSummary => ({ url: `/galleries/${g.id}`, title: titleOf(g), thumbnailUrl: thumbnail(g) }));
      return { items, hasNextPage: items.length >= PER_PAGE };
    }

    return {
      baseUrl: 'http://localhost:9999',

      getPopular: (page: number) => brief(page, undefined, 'rating', 'DESC'),

      getLatest: (page: number) => brief(page, undefined, 'updated_at', 'DESC'),

      search: (query: string, page: number) => brief(page, query, 'path', 'ASC'),

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const data = await graphQl<{ findGallery: Gallery }>('MangaDetails', DETAILS_QUERY, { id: last(manga.url) });
        const g = data.findGallery;
        const photographer = g.photographer?.trim() || undefined;
        return {
          url: manga.url,
          title: titleOf(g),
          author: photographer,
          artist: photographer,
          description: g.details?.trim() || undefined,
          genres: (g.tags ?? []).map((t) => t.name).filter(Boolean),
          thumbnailUrl: thumbnail(g) ?? manga.thumbnailUrl,
          status: 'unknown',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const data = await graphQl<{ findGallery: Gallery }>('ChapterList', CHAPTER_QUERY, { id: last(manga.url) });
        const g = data.findGallery;
        return [
          {
            url: `/galleries/${g.id}`,
            name: 'Chapter',
            number: 1,
            scanlator: g.photographer?.trim() || undefined,
            uploadedAt: Date.parse(g.created_at ?? '') || undefined,
          },
        ];
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const data = await graphQl<{ findImages: { images?: { id?: string }[] } }>('PageList', PAGES_QUERY, {
          id: Number.parseInt(last(chapter.url), 10),
        });
        return (data.findImages.images ?? [])
          .filter((image) => image.id)
          .map((image, index) => ({ index, imageUrl: `${baseUrl()}/image/${image.id}/image` }));
      },

      imageHeaders: () => ({ ...authHeaders(), Accept: 'image/*' }),

      getWebUrl: (item) => `${baseUrl()}${item.url}`,
    };
  },
});
