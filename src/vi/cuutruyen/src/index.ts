import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText } from './common/utils';
import { imageSize } from './image';

const MIRRORS = ['https://cuutruyen.net', 'https://hetcuutruyen.net'];
const MIRROR_PREF = 'mirror';
const COVER_PREF = 'preferred_cover';
const DRM_VERSION = '#v4|';
const DRM_KEY = '3141592653589793';

const baseUrl = () => {
  const mirror = prefs.get<string>(MIRROR_PREF);
  return mirror && MIRRORS.includes(mirror) ? mirror : MIRRORS[0]!;
};
const headers = () => ({ 'User-Agent': USER_AGENT, Referer: `${baseUrl()}/` });

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${baseUrl()}/api/v2${path}`, { headers: headers(), responseType: 'json' })).body;
}

/** The site's js swaps these cdn hosts for its own. */
function storageUrl(url: string): string {
  return url
    .replace('://storage-ct.lrclib.net/', '://storage-bravo.cuutruyen.net/')
    .replace('://storage-ct-riften.site/', '://storage-charlie.cuutruyen.net/');
}

interface MangaItem {
  id: number;
  name: string;
  cover_url: string;
  cover_mobile_url?: string | null;
}

function summary(m: MangaItem): MangaSummary {
  const mobile = prefs.get<string>(COVER_PREF) === 'cover_mobile_url';
  return {
    url: `/mangas/${m.id}`,
    title: m.name,
    thumbnailUrl: storageUrl((mobile && m.cover_mobile_url) || m.cover_url),
  };
}

async function list(path: string): Promise<MangaPage> {
  const result = await api<{ data: MangaItem[]; _metadata: { current_page: number; total_pages: number } }>(path);
  return { items: result.data.map(summary), hasNextPage: result._metadata.current_page < result._metadata.total_pages };
}

const idOf = (url: string) => /\/mangas\/(\d+)/.exec(url)?.[1] ?? '';

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: MIRROR_PREF,
      label: 'Tên miền',
      options: MIRRORS.map((url) => ({ label: url.replace('https://', ''), value: url })),
      default: MIRRORS[0]!,
    },
    {
      type: 'select',
      key: COVER_PREF,
      label: 'Chất lượng ảnh bìa',
      options: [
        { label: 'Chất lượng cao (Desktop)', value: 'cover_url' },
        { label: 'Chất lượng thấp (Mobile)', value: 'cover_mobile_url' },
      ],
      default: 'cover_url',
    },
  ],
  createSource: () => ({
    get baseUrl() {
      return baseUrl();
    },
    getPopular: (page) => list(`/mangas/top?duration=all&page=${page}&per_page=24`),
    getLatest: (page) => list(`/mangas/recently_updated?page=${page}&per_page=30`),
    async getFilters(): Promise<Filter[]> {
      type Tag = { name: string; slug: string };
      const tags = await api<{ data: { common_tags: Tag[]; warning_tags: Tag[]; normal_tags: Tag[] } }>('/tags/popular')
        .then((r) => [...r.data.common_tags, ...r.data.warning_tags, ...r.data.normal_tags])
        .catch(() => [] as Tag[]);
      const unique = [...new Map(tags.map((t) => [t.slug, t])).values()];
      return unique.length
        ? [
            {
              type: 'group',
              id: 'tags',
              label: 'Thể loại',
              filters: unique.map((t): Filter => ({ type: 'checkbox', id: `tag.${t.name}`, label: t.name })),
            },
          ]
        : [];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const tags = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('tag.') && value === true)
        .map(([id]) => `"${id.slice(4)}"`)
        .join(' AND ');
      return list(
        `/mangas/search?q=${encodeURIComponent(query)}&tags=${encodeURIComponent(tags)}&page=${page}&per_page=24`,
      );
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { data } = await api<{
        data: MangaItem & {
          author?: { name: string } | null;
          full_description?: string | null;
          tags: { name: string }[];
        };
      }>(`/mangas/${idOf(manga.url)}`);
      const statusTags = data.tags
        .map((t) => t.name)
        .join(' ')
        .toLowerCase();
      const status: MangaStatus = statusTags.includes('tạm ngưng')
        ? 'hiatus'
        : statusTags.includes('hoàn thành')
          ? 'completed'
          : 'ongoing';
      return {
        ...summary(data),
        author: data.author?.name || undefined,
        genres: data.tags.map((t) => t.name),
        description: data.full_description ? htmlToText(data.full_description) : undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const { data } = await api<{
        data: { id: number; number: string; name?: string | null; created_at?: string | null }[];
      }>(`/mangas/${id}/chapters`);
      return data.map((c) => {
        const time = c.created_at ? Date.parse(c.created_at) : Number.NaN;
        return {
          url: `/mangas/${id}/chapters/${c.id}`,
          name: `Chương ${c.number}${c.name ? ` ${c.name}` : ''}`,
          number: Number(c.number) || undefined,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { data } = await api<{ data: { pages: { order: number; image_url: string; drm_data?: string | null }[] } }>(
        `/chapters/${chapter.url.split('/').pop()}`,
      );
      // Scrambled pages carry their strip map in the fragment for transformImage.
      return [...data.pages]
        .sort((a, b) => a.order - b.order)
        .map((p, index) => ({
          index,
          imageUrl: storageUrl(p.image_url) + (p.drm_data ? `#drm_data=${encodeURIComponent(p.drm_data)}` : ''),
        }));
    },
    imageHeaders: () => headers(),
    /** drm_data: base64 of "#v4|dy-h|dy-h|…" XOR-ed with a fixed key; strips are stacked in source order. */
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const drm = /#drm_data=(.+)$/.exec(page.imageUrl ?? '')?.[1];
      if (!drm) return {};
      const decoded = base64.decodeBytes(decodeURIComponent(drm));
      const mapping = utf8.decode(Array.from(decoded, (b, i) => b ^ DRM_KEY.charCodeAt(i % DRM_KEY.length)));
      if (!mapping.startsWith(DRM_VERSION)) throw new Error('Unsupported CuuTruyen DRM data');
      const size = imageSize(bytes);
      if (!size) return {};
      const [width, height] = size;
      const ops: TileOp[] = [];
      let sy = 0;
      for (const strip of mapping.split('|').slice(1)) {
        const [dy, h] = strip.split('-').map(Number) as [number, number];
        if (h > 0 && sy + h <= height && dy + h <= height) ops.push({ sx: 0, sy, w: width, h, dx: 0, dy });
        sy += h;
      }
      return { tiles: { width, height, ops } };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/mangas\/(\d+)/i.exec(url.trim());
      return match && MIRRORS.some((m) => hostOf(m) === match[1]!.toLowerCase())
        ? { url: `/mangas/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => baseUrl() + item.url,
  }),
});
