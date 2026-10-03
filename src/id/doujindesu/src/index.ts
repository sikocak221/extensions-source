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
import { USER_AGENT, decodeEntities, hostOf, withQuery } from './common/utils';
import { decrypt } from './crypto';

const BASE_URL = 'https://doujin.desu.xxx';
const API_URL = `${BASE_URL}/api`;
const APP_SECRET = 'dfdf72051dbfdc7d76889ebd31324e74';
const LIMIT = 24;

// Manga urls are "/manga/<slug>/", chapter urls the chapter id (read at /reader/<id>).

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, 'x-app-secret': APP_SECRET };

async function api<T>(url: string): Promise<{ body: T; headers: Record<string, string> }> {
  const response = await http.get(url, { headers });
  let text = response.body;
  try {
    const parsed = JSON.parse(text) as { _enc_resp_?: string };
    if (parsed._enc_resp_) text = decrypt(parsed._enc_resp_);
  } catch (error) {
    if (error instanceof Error && error.message === 'Decryption failed') throw error;
  }
  return { body: JSON.parse(text) as T, headers: response.headers };
}

// ---------------------------------------------------------------------------------------------

interface MangaItem {
  title: string;
  slug: string;
  description?: string | null;
  author?: string | null;
  status: string;
  type: string;
  chapters?: { id: string; chapter_number: number; created_at: string; title?: string | null }[];
  alt_titles?: string | null;
  term_list?: string | null;
  cover_url: string;
}

function terms(item: MangaItem): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of item.term_list?.split('|') ?? []) {
    const [name, kind, extra] = entry.split(':');
    if (name === undefined || kind === undefined || extra === undefined) continue;
    map.set(kind, [...(map.get(kind) ?? []), name]);
  }
  return map;
}

const known = (values: string[] | undefined) =>
  values?.map((v) => v.trim()).filter((v) => v && v.toUpperCase() !== 'N/A') ?? [];
const isCompleted = (item: MangaItem) => ['completed', 'finished'].includes(item.status.toLowerCase());

function toSummary(item: MangaItem): MangaSummary {
  return {
    url: `/manga/${item.slug}/`,
    title: item.title,
    thumbnailUrl: item.cover_url.startsWith('/') ? BASE_URL + item.cover_url : item.cover_url,
  };
}

function cleanDescription(raw: string): string[] {
  const htmlText = decodeEntities(raw).replace(/<br\s*\/?>/gi, '%%BR%%');
  const text = decodeEntities(html.load(htmlText).text());
  const lines: string[] = [];
  for (const part of text.split('%%BR%%')) {
    let line = part.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    const cut = [lower.indexOf('download batch'), lower.indexOf('download volume')].filter((i) => i >= 0);
    const index = cut.length > 0 ? Math.min(...cut) : -1;
    if (index >= 0) line = line.slice(0, index).trim();
    if (line) lines.push(line.replace(/^\s*(?:sinopsis|synopsis)\s*:?\s*/i, '').trim());
    if (index >= 0) break;
  }
  return lines.filter(Boolean);
}

function toDetails(item: MangaItem): MangaDetails {
  const map = terms(item);
  const author =
    (item.author?.trim() && item.author.toUpperCase() !== 'N/A' ? item.author : undefined) ??
    ['author', 'artist', 'author_artist', 'creator'].map((k) => known(map.get(k)).join(', ')).find(Boolean) ??
    (known(map.get('group')).join(', ') || undefined);
  const lines = item.description?.trim() ? cleanDescription(item.description) : [];
  const parts: string[] = [];
  if (lines.length > 0) {
    const chapterList = /^\d+(?:-\d+)?\.\s*.+$/.test(lines[0]!);
    parts.push(`${chapterList ? 'Daftar Chapter' : 'Sinopsis'}:\n${lines.join(chapterList ? '\n' : '\n\n')}`);
  } else parts.push('Tidak ada deskripsi yang tersedia');
  const info: string[] = [];
  const isManhwa =
    item.type.toLowerCase() === 'manhwa' || (map.get('series') ?? []).some((s) => s.toLowerCase() === 'manhwa');
  const orUnknown = (values: string[] | undefined) => known(values).join(', ') || 'Tidak Diketahui';
  if (!isManhwa) {
    info.push(`Tipe: ${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}`);
    info.push(`Group: ${orUnknown(map.get('group'))}`);
    info.push(`Karakter: ${orUnknown(map.get('character'))}`);
  }
  if (map.get('series')) info.push(`Seri: ${map.get('series')!.join(', ')}`);
  if (item.alt_titles?.trim()) {
    info.push(
      `Judul Alternatif: ${item.alt_titles
        .split(/[|,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .join(', ')}`,
    );
  }
  if (info.length > 0) parts.push(info.join('\n'));

  const status = item.status.toLowerCase();
  let mangaStatus: MangaStatus = 'unknown';
  if (status === 'ongoing' || status === 'publishing') mangaStatus = 'ongoing';
  else if (isCompleted(item)) mangaStatus = 'completed';
  else if (status === 'hiatus') mangaStatus = 'hiatus';
  const titleCase = (s: string) =>
    s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  return {
    ...toSummary(item),
    author,
    status: mangaStatus,
    description: parts.join('\n\n'),
    genres: (map.get('genre') ?? []).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(titleCase),
    type: isManhwa ? 'manhwa' : item.type.toLowerCase() === 'manga' ? 'manga' : undefined,
  };
}

function listUrl(page: number, sort = 'latest_chapter'): string {
  return `${API_URL}/manga?limit=${LIMIT}&offset=${(page - 1) * LIMIT}&sort=${sort}`;
}

async function mangaList(url: string, page: number): Promise<MangaPage> {
  const { body, headers: responseHeaders } = await api<MangaItem[]>(url);
  const total = Number.parseInt(responseHeaders['x-total-count'] ?? '', 10);
  return { items: body.map(toSummary), hasNextPage: Number.isNaN(total) ? true : page * LIMIT < total };
}

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';
const option = (label: string, value: string) => ({ label, value });
const GENRES = ["Age Progression","Age Regression","Ahegao","All The Way Through","Amputee","Anal","Anorexia","Apron","Artist CG","Aunt","Bald","Bestiality","Big Ass","Big Breast","Big Penis","Bike Shorts","Bikini","Birth","Bisexual","Blackmail","Blindfold","Bloomers","Blowjob","Body Swap","Bodysuit","Bondage","Business Suit","Cheating","Collar","Condom","Cousin","Crossdressing","Cunnilingus","DILF","Dark Skin","Daughter","Defloration","Demon","Demon Girl","Dick Growth","Double Penetration","Drugs","Drunk","Elf","Emotionless Sex","Exhibitionism","Eyepatch","Females Only","Femdom","Filming","Fingering","Footjob","Full Color","Furry","Futanari","Garter Belt","Gender Bender","Ghost","Glasses","Group","Guro","Gyaru","Hairy","Handjob","Harem","Horns","Huge Breast","Huge Penis","Humiliation","Impregnation","Incest","Inflation","Insect","Inseki","Inverted Nipples","Invisible","Kemomi","Kemomimi","Kimono","Lactation","Leotard","Lingerie","Loli","Lolipai","MILF","Maid","Males Only","Masturbation","Miko","Mind Break","Mind Control","Minigirl","Miniguy","Monster","Monster Girl","Mother","Multi-work Series","Muscle","Nakadashi","Necrophilia","Netorare","Niece","Nipple Fuck","Nurse","Old Man","Oyakodon","Paizuri","Pantyhose","Possession","Pregnant","Prostitution","Rape","Rimjob","Scat","School Uniform","Sex Toys","Shemale","Shota","Sister","Sleeping","Slime","Small Breast","Snuff","Sole Female","Sole Male","Stocking","Story Arc","Sumata","Sweating","Swimsuit","Tanlines","Teacher","Tentacles","Tomboy","Tomgirl","Torture","Twins","Twintails","Uncensored","Unusual Pupils","Virginity","Webtoon","Widow","X-Ray","Yandere","Yaoi","Yuri",]; // prettier-ignore

// Taxonomy searches are remembered (name → slug).
const slugCache = new Map<string, string>();

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => mangaList(listUrl(page, 'rating'), page),

    getLatest: (page) => mangaList(listUrl(page), page),

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof state[id] === 'string' ? (state[id] as string).trim() : '');
      // Without a text query, the author/group/series filter wins.
      const kind = text('taxonomy');
      const name = text('taxonomy_value');
      if (!query.trim() && name) {
        if (!kind) throw new Error('Pilih tipe filter');
        const key = `${kind}:${name}`;
        let slug = slugCache.get(key);
        if (!slug) {
          const { body } = await api<{ terms: { slug: string }[] }>(
            withQuery(`${API_URL}/taxonomy/${kind}/`, { search: name, limit: '1' }),
          );
          slug = body.terms[0]?.slug;
          if (!slug) throw new Error(`Gagal menemukan: ${name}`);
          slugCache.set(key, slug);
        }
        const { body } = await api<{ mangaList: MangaItem[]; pagination: { page: number; totalPages: number } }>(
          `${API_URL}/taxonomy/${kind}/${slug}?limit=${LIMIT}&page=${page}`,
        );
        return { items: body.mangaList.map(toSummary), hasNextPage: body.pagination.page < body.pagination.totalPages };
      }
      let url = withQuery(listUrl(page, text('order') || 'latest_chapter'), {
        search: query.trim() || undefined,
        status: text('status') || undefined,
        type: text('category') || undefined,
      });
      const genres = GENRES.filter((g) => state[`genre.${g}`] === true).map((g) => g.toLowerCase().replace(/ /g, '-'));
      if (genres.length > 0) url += `&genre=${genres.join(',')}`;
      return mangaList(url, page);
    },

    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filter Tipe Diabaikan Saat Menggunakan Pencarian' },
      {
        type: 'select',
        id: 'taxonomy',
        label: 'Filter Tipe',
        options: [
          option('Tidak Ada', ''),
          option('Penulis', 'authors'),
          option('Grup', 'groups'),
          option('Genre', 'genres'),
          option('Seri', 'series'),
          option('Karakter', 'characters'),
        ],
      },
      { type: 'text', id: 'taxonomy_value', label: 'Nama' },
      { type: 'separator' },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('Semua', ''),
          option('Berlanjut', 'publishing'),
          option('Selesai', 'completed'),
          option('Hiatus', 'hiatus'),
        ],
      },
      {
        type: 'select',
        id: 'category',
        label: 'Kategori',
        options: [
          option('Semua', ''),
          option('Doujinshi', 'doujinshi'),
          option('Manga', 'manga'),
          option('Manhwa', 'manhwa'),
        ],
      },
      {
        type: 'select',
        id: 'order',
        label: 'Urutkan',
        options: [
          option('Update Terbaru', 'latest_chapter'),
          option('Baru Ditambahkan', 'newest'),
          option('Terlama', 'oldest'),
          option('Populer', 'rating'),
          option('A-Z', 'title_asc'),
        ],
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map((g) => ({ type: 'checkbox', id: `genre.${g}`, label: g })),
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return toDetails((await api<MangaItem>(`${API_URL}/manga/${slugOf(manga.url)}`)).body);
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { body: item } = await api<MangaItem>(`${API_URL}/manga/${slugOf(manga.url)}`);
      return (item.chapters ?? []).map((c, index) => {
        const time = Date.parse(c.created_at);
        return {
          url: c.id,
          name: `Chapter ${String(c.chapter_number).replace(/\.0$/, '')}${isCompleted(item) && index === 0 ? ' END' : ''}`,
          number: c.chapter_number,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const { body } = await api<{ content_urls: string[] }>(`${API_URL}/chapters/${chapter.url}`);
      return body.content_urls.map((url, index) => {
        let imageUrl = decodeEntities(url);
        if (imageUrl.includes('/uploads/') && !imageUrl.includes('/storage/uploads/'))
          imageUrl = imageUrl.replace('/uploads/', '/storage/uploads/');
        else if (imageUrl.includes('/upload/') && !imageUrl.includes('/storage/upload/'))
          imageUrl = imageUrl.replace('/upload/', '/storage/upload/');
        return { index, imageUrl };
      });
    },

    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}/`, title: '' } : null;
    },

    getWebUrl: (item) => (item.url.startsWith('/') ? `${BASE_URL}${item.url}` : `${BASE_URL}/reader/${item.url}`),
  }),
});
