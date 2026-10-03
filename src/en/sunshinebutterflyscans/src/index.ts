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
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://wings.sbs';
const CDN_URL = `${BASE_URL}/images/projcoverjpeg/`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GOOGLE_DRIVE_KEY = 'AIzaSyDDWjOHN1UPcafkwyJLO7fX1gmVyntIozs';
const IMGUR_CLIENT_ID = '227a2add62d2c9c';
const KEY = base64.decodeBytes('YX+1nM4KgfaYwNE3/MPcTg==');
const IV = base64.decodeBytes('279GjT2Xu9LZBkI4zLzIAg==');

interface EntryDto {
  series: string;
  timestamp: string;
  num: number;
  chname: string;
  AlbumID: string;
  projectname: string;
  projectdesc: string;
  projectaltname: string;
  projectauthor: string;
  projectartist: string;
  projectthumb: string;
  projectstatus: string;
  projecttags: string;
}

/** Every series' chapters, newest first. The whole site is one JSON file. */
async function chaptersData(): Promise<EntryDto[][]> {
  const response = await http.get(`${BASE_URL}/json/chapters.json`, { headers: { ...headers, Accept: '*/*' } });
  const groups = new Map<string, EntryDto[]>();
  for (const entry of JSON.parse(response.body) as EntryDto[]) {
    const group = groups.get(entry.series) ?? [];
    group.push(entry);
    groups.set(entry.series, group);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => b.num - a.num));
}

const timestamp = (group: EntryDto[]) => Number(group[0]!.timestamp) || Number.MAX_SAFE_INTEGER;

const toSummary = (e: EntryDto): MangaSummary => ({
  url: `/projects?n=${e.projectname}`,
  title: e.series,
  thumbnailUrl: CDN_URL + e.projectthumb,
});

function status(text: string): MangaStatus {
  switch (text) {
    case 'current':
      return 'ongoing';
    case 'complete':
      return 'completed';
    case 'dropped':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

const byName = (a: EntryDto[], b: EntryDto[]) => a[0]!.series.localeCompare(b[0]!.series);
const byUpdate = (a: EntryDto[], b: EntryDto[]) => timestamp(b) - timestamp(a);

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (): Promise<MangaPage> => ({
      items: (await chaptersData()).sort(byName).map((g) => toSummary(g[0]!)),
      hasNextPage: false,
    }),
    getLatest: async (): Promise<MangaPage> => ({
      items: (await chaptersData()).sort(byUpdate).map((g) => toSummary(g[0]!)),
      hasNextPage: false,
    }),
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const sort = (filters.sort as { value?: string; ascending?: boolean } | undefined) ?? {};
      const wanted = typeof filters.status === 'string' ? filters.status : '';
      const q = query.trim().toLowerCase();
      const groups = (await chaptersData())
        .sort(sort.value === 'updated' ? byUpdate : byName)
        .filter((g) => g[0]!.series.toLowerCase().includes(q) && g[0]!.projectstatus.includes(wanted));
      if (sort.ascending) groups.reverse();
      return { items: groups.map((g) => toSummary(g[0]!)), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'All', value: '' },
          { label: 'Current', value: 'current' },
          { label: 'Complete', value: 'complete' },
          { label: 'Dropped', value: 'dropped' },
          { label: 'Licensed', value: 'licensed' },
        ],
        default: '',
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Sort by',
        options: [
          { label: 'Name', value: 'name' },
          { label: 'Last Updated', value: 'updated' },
        ],
        default: { value: 'name', ascending: false },
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const name = manga.url.split('?n=')[1];
      const group = (await chaptersData()).find((g) => g[0]!.projectname === name);
      if (!group) throw new Error('Series not found');
      const e = group[0]!;
      return {
        ...toSummary(e),
        description:
          [e.projectdesc, e.projectaltname ? `Alternative name: ${e.projectaltname}` : '']
            .filter(Boolean)
            .join('\n\n') || undefined,
        genres: e.projecttags ? e.projecttags.split(',').map((t) => t.trim()) : [],
        status: status(e.projectstatus),
        author: e.projectauthor || undefined,
        artist: e.projectartist || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const name = manga.url.split('?n=')[1];
      const group = (await chaptersData()).find((g) => g[0]!.projectname === name) ?? [];
      return group.map((e) => ({
        url: `/read?series=${e.projectname}&num=${e.num}`,
        name: e.chname,
        number: e.num,
        uploadedAt: e.timestamp ? Number(e.timestamp) * 1000 : undefined,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const key = chapter.url.split('series=')[1];
      const entry = (await chaptersData()).flat().find((e) => `${e.projectname}&num=${e.num}` === key);
      if (!entry) throw new Error('Chapter not found');
      const album = utf8.decode([
        ...crypto.aesDecrypt(base64.decodeBytes(entry.AlbumID), KEY, { mode: 'cbc', iv: IV }),
      ]);
      // Long ids are Google Drive folders, short ones Imgur albums.
      if (album.length > 10) {
        const url =
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`"${album}" in parents`)}` +
          `&key=${GOOGLE_DRIVE_KEY}&orderBy=name_natural&fields=files(id,name,imageMediaMetadata)&pageSize=250`;
        const { files } = JSON.parse((await http.get(url, { headers: { 'User-Agent': USER_AGENT } })).body) as {
          files: { id: string; name: string; imageMediaMetadata: { width: number } }[];
        };
        return files
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
          .map((f, index) => ({
            index,
            imageUrl: `https://lh3.googleusercontent.com/d/${f.id}=w${f.imageMediaMetadata.width}`,
          }));
      }
      const response = await http.get(`https://api.imgur.com/3/album/${album}/images`, {
        headers: { 'User-Agent': USER_AGENT, Authorization: `Client-ID ${IMGUR_CLIENT_ID}` },
      });
      return (JSON.parse(response.body) as { data: { link: string }[] }).data.map((d, index) => ({
        index,
        imageUrl: d.link,
      }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,*/*' }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/projects\?(?:[^#]*&)?n=([^&#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/projects?n=${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
