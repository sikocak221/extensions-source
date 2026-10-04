import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://www.mangatales.com';
const CDN_URL = 'https://media.mangatales.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface BrowseManga {
  id: number;
  title: string;
  cover?: string | null;
  is_novel: boolean;
}

interface NameDto {
  name: string;
}

interface MangaDto {
  id: number;
  cover?: string | null;
  title: string;
  summary?: string | null;
  artists: NameDto[];
  authors: NameDto[];
  story_status: number;
  type: { name: string; title?: string | null };
  categories: NameDto[];
  translation_status: number;
  synonyms?: string | null;
  arabic_title?: string | null;
  japanese?: string | null;
  english?: string | null;
}

const thumbnail = (id: number, cover?: string | null) =>
  cover ? `${CDN_URL}/uploads/manga/cover/${id}/large_${cover}` : undefined;

const toSummary = (manga: BrowseManga): MangaSummary => ({
  url: `/mangas/${manga.id}`,
  title: manga.title,
  thumbnailUrl: thumbnail(manga.id, manga.cover),
});

// "ciphertext|?|iv|key" – the AES key is the SHA-256 digest of the last part.
function decrypt(data: string): string {
  const parts = data.split('|');
  const key = (crypto.sha256(parts[3]!).match(/../g) ?? []).map((h) => Number.parseInt(h, 16));
  const bytes = crypto.aesDecrypt(base64.decodeBytes(parts[0]!), key, {
    mode: 'cbc',
    iv: base64.decodeBytes(parts[2]!),
  });
  return utf8.decode(Array.from(bytes));
}

/** The JSON props of the page's React component. */
function reactProps<T>(document: HtmlElement): T {
  return JSON.parse(document.selectFirst('.js-react-on-rails-component')?.html() ?? '{}') as T;
}

async function search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  const status = typeof filters.status === 'string' ? filters.status : '';
  const body = {
    oneshot: { value: false },
    title: query,
    page,
    manga_types: { include: ['1', '2'], exclude: [] },
    story_status: { include: status ? [status] : [], exclude: [] },
    // Untranslated entries have no chapters to read.
    translation_status: { include: [], exclude: ['3'] },
    categories: { include: [null], exclude: [] },
    chapters: { min: '', max: '' },
    dates: { start: '', end: '' },
  };
  const response = await http.post(`${BASE_URL}/api/mangas/search`, { json: body }, { headers });
  const data = JSON.parse(decrypt((JSON.parse(response.body) as { data: string }).data)) as { mangas: BrowseManga[] };
  return { items: data.mangas.map(toSummary), hasNextPage: data.mangas.length === 50 };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search('', page, {}),
    async getLatest(page): Promise<MangaPage> {
      const response = await http.get(`${BASE_URL}/api/releases?page=${page}`, { headers });
      const releases = (JSON.parse(response.body) as { releases: { manga: BrowseManga }[] }).releases.filter(
        (release) => !release.manga.is_novel,
      );
      const seen = new Set<number>();
      const items = releases
        .map((release) => release.manga)
        .filter((manga) => !seen.has(manga.id) && !!seen.add(manga.id))
        .map(toSummary);
      return { items, hasNextPage: releases.length >= 30 };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'status',
        label: 'حالة القصة',
        options: [
          { label: 'الكل', value: '' },
          { label: 'مستمرة', value: '2' },
          { label: 'منتهية', value: '3' },
        ],
      },
    ],
    search: (query, page, filters) => search(query, page, filters),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const dto = reactProps<{ mangaDataAction: { mangaData: MangaDto } }>(
        html.load(response.body, { baseUrl: response.url }),
      ).mangaDataAction.mangaData;
      const status: MangaStatus = dto.story_status === 2 ? 'ongoing' : dto.story_status === 3 ? 'completed' : 'unknown';
      const translation = ['منتهية', 'مستمرة', 'متوقفة'][dto.translation_status] ?? 'مجهول';
      const titles = [dto.synonyms, dto.arabic_title, dto.japanese, dto.english].filter((t): t is string => !!t);
      const description = [
        dto.summary || 'لم يتم اضافة قصة بعد',
        `حالة الترجمة:\n• ${translation}`,
        ...(titles.length ? [`مسميّات أخرى:\n• ${titles.join('\n• ')}`] : []),
      ].join('\n\n');
      const genres = [dto.type.title, dto.type.name, ...dto.categories.map((c) => c.name)].filter(
        (g): g is string => !!g,
      );
      return {
        url: manga.url,
        title: dto.title,
        thumbnailUrl: thumbnail(dto.id, dto.cover) ?? manga.thumbnailUrl,
        artist: dto.artists.map((a) => a.name).join(', ') || undefined,
        author: dto.authors.map((a) => a.name).join(', ') || undefined,
        genres,
        description,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(`${BASE_URL}/api${manga.url}`, { headers });
      const releases = (
        JSON.parse(response.body) as {
          mangaReleases: {
            id: number;
            chapter: number | string;
            title: string;
            team_name: string;
            created_at: string;
          }[];
        }
      ).mangaReleases;
      return releases
        .map((release) => {
          const number = Number(release.chapter);
          return {
            url: `/r/${release.id}`,
            name: `${number}${release.title.trim() ? ` - ${release.title}` : ''}`,
            number,
            scanlator: release.team_name,
            uploadedAt: Date.parse(release.created_at) || 0,
          };
        })
        .sort((a, b) => b.number - a.number || b.uploadedAt - a.uploadedAt);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const data = reactProps<{
        readerDataAction: { readerData: { release: { hq_pages: string } } };
        globals: { mediaKey: string };
      }>(html.load(response.body, { baseUrl: response.url }));
      return data.readerDataAction.readerData.release.hq_pages.split('\r\n').map((image, index) => ({
        index,
        imageUrl: `${CDN_URL}/uploads/releases/${image}?ak=${data.globals.mediaKey}`,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/mangas\/\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
