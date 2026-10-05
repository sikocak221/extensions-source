import {
  type Chapter,
  type Filter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://ariatoon.com';
const API_URL = 'https://api.ariatoon.com/v1';
const CDN_URL = 'https://api.ariatoon.com/uploads';
const PAGE_SIZE = 20;
const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: `${BASE_URL}/` };

const GENRES = [
  { label: 'الكل', value: '' },
  { label: 'تجسيد', value: 'a8dbb6c9-93bb-46f3-a4ea-d8ffcf126096' },
  { label: 'اعادة إحياء', value: 'c4a7ed08-d9a3-4e95-8b58-e6fc67e56004' },
  { label: 'فن معجبين', value: '87fda931-9ffe-496a-8ce2-df163524834f' },
  { label: 'رياضي', value: '1e693af2-33da-4a9d-abc2-b9f5b7ce1e9c' },
  { label: 'قصة قصيرة', value: '7b2b3b97-4ec8-49d0-b0db-ac5518cb43d3' },
  { label: 'نفسي', value: '2ba91d6e-a106-440c-be5b-0f2e46d5fffa' },
  { label: 'مغامرة', value: '16faa1ee-a809-4acc-97a7-ae6f8cbe6137' },
  { label: 'مصاص دماء', value: '28d84eba-de60-4748-ae04-42e9b5776d46' },
  { label: 'قوة خارقة', value: 'b4676795-e440-4d3a-ac51-475303a9d2b5' },
  { label: 'فنون الدفاع عن النفس', value: '16481cd5-3ad7-4dda-9737-50c8f607b6a7' },
  { label: 'عنف', value: '8bdf8691-6873-4a26-8966-f69b6c218ba2' },
  { label: 'طبي', value: '28820879-ee69-40fe-a338-7b604033aa47' },
  { label: 'شوجو', value: 'd5db894b-c01b-42ae-913d-2ad1197a95e8' },
  { label: 'شرطة', value: 'fd998a81-fbba-4a3f-8332-473eee861972' },
  { label: 'سينين', value: '5aec5131-f069-43ab-8714-a65532a8f757' },
  { label: 'سحر', value: 'abd7edd1-a6a4-4285-b253-92e885ae7255' },
  { label: 'زمكاني', value: '994afa00-00eb-49cd-a77e-851243134f19' },
  { label: 'دموى', value: 'b6b2f032-d9d0-4366-9b71-dce24466156b' },
  { label: 'خيال', value: 'c7a8a731-1ec3-4241-a4fa-6067389ac195' },
  { label: 'حياة مدرسية', value: '59042779-6c1a-454d-8595-c9ae9f9356ac' },
  { label: 'تاريخي', value: '485a4351-f66c-481b-9f25-dcd038723bff' },
  { label: 'إنتقام', value: 'b430ba29-00b2-40f1-a314-f0ad9042b9a0' },
  { label: 'ألعاب', value: '2e810cf2-cb4d-4bf6-aa40-25df91712043' },
  { label: 'شريحة من الحياة', value: '28d98105-419a-4f33-89ca-0f040b890caf' },
  { label: 'غموض', value: 'ad930486-f830-4953-8be0-d3a070955922' },
  { label: 'خيال علمي', value: '30f8cbc6-788d-467d-9dc8-86d3c774c00e' },
  { label: 'كوميديا', value: '819cb8f1-31d3-4ec9-a653-a06d0717df66' },
  { label: 'رعب', value: '4db48a10-acf5-441e-a9c2-b7a59dfe0d4b' },
  { label: 'إثارة', value: 'ac9b5657-0ea2-46c3-a99e-a987fe356395' },
  { label: 'أكشن', value: '38c19662-9798-4c60-8f24-5c8d5331fa57' },
  { label: 'فانتازيا', value: '61dd5a30-258c-45b0-bca5-0e78786dfa2b' },
  { label: 'دراما', value: '1ee85204-43fb-460c-8709-9399b4b81d61' },
  { label: 'رومانسية', value: 'd47a8924-f0fe-4ef4-b1a7-cd893df59f84' },
  { label: 'شونين', value: '4d8b9e77-890c-46c3-96c0-861bf38e98be' },
];

interface MangaDto {
  id: string;
  title: string;
  coverPath: string;
  author?: string | null;
  summary?: string | null;
  status?: string | null;
  announce?: string | null;
}

interface ChapterDto {
  id: string;
  mangaID: string;
  createdAt: string;
  title?: string | null;
  number?: number | null;
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${API_URL}${path}`, { headers });
  return JSON.parse(response.body) as T;
}

const toSummary = (dto: MangaDto): MangaSummary => ({
  url: `/series/manga/${dto.id}`,
  title: dto.title,
  thumbnailUrl: `${CDN_URL}/${dto.coverPath}`,
});

const idOf = (url: string) => url.replace(/^\/series\/manga\//, '');

async function list(path: string): Promise<MangaPage> {
  const result = await api<{ data?: MangaDto[] | null }>(path);
  const items = (result.data ?? []).map(toSummary);
  return { items, hasNextPage: items.length === PAGE_SIZE };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/feed/mangas/popular?page=${page}&limit=${PAGE_SIZE}`),
    getLatest: (page) => list(`/mangas?page=${page}&limit=${PAGE_SIZE}`),
    getFilters: (): Filter[] => [
      { type: 'header', label: 'ملاحظة: لا يمكن استخدام البحث النصي مع الفلاتر' },
      { type: 'separator' },
      { type: 'select', id: 'genre', label: 'التصنيفات', options: [{ label: 'الكل', value: '' }, ...GENRES] },
    ],
    search(query, page, filters) {
      // The API has different endpoints for text search and genre filtering.
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      if (query.trim())
        return list(`/mangas/search?page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(query.trim())}`);
      if (genre) return list(`/mangas/filters/${genre}?page=${page}&limit=${PAGE_SIZE}&language=ar`);
      return list(`/mangas?page=${page}&limit=${PAGE_SIZE}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = (await api<{ data: MangaDto }>(`/mangas/${idOf(manga.url)}`)).data;
      const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus' };
      const description = [dto.summary?.trim(), dto.announce?.trim() ? `إعلان:\n${dto.announce}` : '']
        .filter(Boolean)
        .join('\n\n');
      return {
        ...toSummary(dto),
        author: dto.author ?? undefined,
        description: description || undefined,
        status: statuses[dto.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const result = await api<{ data?: ChapterDto[] | null }>(
        `/mangas/${idOf(manga.url)}/episodes?direction=desc&publishStatus=published&limit=100&page=1`,
      );
      return (result.data ?? []).map((dto) => {
        const title = dto.title?.trim();
        const number = dto.number ?? undefined;
        const name = `${number !== undefined ? `الفصل ${number}${title ? ' - ' : ''}` : ''}${title ?? ''}`;
        return {
          url: `/series/manga/${dto.mangaID}/episodes/${dto.id}`,
          name: name || 'الفصل',
          number,
          uploadedAt: Date.parse(dto.createdAt) || undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const path = chapter.url.replace(/^\/series\/manga\//, '');
      const mangaId = path.split('/episodes/')[0];
      const episodeId = path.slice(path.lastIndexOf('/') + 1);
      const result = await api<{ data: { images?: string[] } }>(`/mangas/${mangaId}/episodes/${episodeId}`);
      return (result.data.images ?? []).map((image, index) => ({ index, imageUrl: `${CDN_URL}/${image}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?ariatoon\.com\/series\/manga\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/series/manga/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
