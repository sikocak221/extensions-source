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
import { USER_AGENT, withQuery } from './common/utils';
import { hmacSha256Hex } from './hmac';

const BASE_URL = 'https://beta.kumopoi.com';
const API_HOST = 'https://api.kumopoi.com';
const API_URL = `${API_HOST}/api/v1`;
const SIGNING_KEY = 'vtm6RLiSyKmWd1YpZtkt5ue4oPdYdmzW0ZgxDgyBNEM=';
const PAGE_LIMIT = 20;

// Manga urls are "/comic/<slug>", chapter urls "/comic/<slug>/chapter/<number>#<chapter id>".

interface ComicDto {
  slug: string;
  title: string;
  cover?: string | null;
  coverMedium?: string | null;
  coverSmall?: string | null;
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  genres?: { name: string; slug: string }[];
  chapters?: { id: string; number: string; title?: string | null; isLocked?: boolean; publishedAt?: string | null }[];
}

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json' };

async function api<T>(url: string, extra: Record<string, string> = {}): Promise<T> {
  return (await http.get<T>(url, { headers: { ...headers, ...extra }, responseType: 'json' })).body;
}

function coverUrl(cover: string | null | undefined): string | undefined {
  if (!cover) return undefined;
  if (/^https?:\/\//.test(cover)) return cover;
  return `https://kumo.gorae.my.id/${cover.replace(/^\//, '').split('/').map(encodeURIComponent).join('/')}`;
}

const toSummary = (c: ComicDto): MangaSummary => ({
  url: `/comic/${c.slug}`,
  title: c.title,
  thumbnailUrl: coverUrl(c.coverMedium ?? c.cover ?? c.coverSmall),
});

const slugOf = (url: string) => url.replace(/#.*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';

async function comics(page: number, params: Record<string, string | undefined>): Promise<MangaPage> {
  const url = withQuery(`${API_URL}/comics`, { page: String(page), limit: String(PAGE_LIMIT), ...params });
  const { data } = await api<{ data: { data?: ComicDto[]; meta: { page?: number; totalPages?: number } } }>(url);
  return { items: (data.data ?? []).map(toSummary), hasNextPage: (data.meta.page ?? 1) < (data.meta.totalPages ?? 1) };
}

function nonce(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < length; i++) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}

const option = (label: string, value: string) => ({ label, value });
const GENRES: [string, string][] = [["Action", "action"],["Adult", "adult"],["Adventure", "adventure"],["Age Regression", "age-regression"],["Ahegao", "ahegao"],["Amputee", "amputee"],["Anal", "anal"],["Apron", "apron"],["Artist CG", "artist-cg"],["Aunt", "aunt"],["Bald", "bald"],["BDSM", "bdsm"],["Beauty Mark", "beauty-mark"],["Bestiality", "bestiality"],["Big Areolae", "big-areolae"],["Big Ass", "big-ass"],["Big Breast", "big-breast"],["Big Nipples", "big-nipples"],["Big Penis", "big-penis"],["Bike Shorts", "bike-shorts"],["Bikini", "bikini"],["Birth", "birth"],["Bisexual", "bisexual"],["Biting", "biting"],["Blackmail", "blackmail"],["Blindfold", "blindfold"],["Bloomers", "bloomers"],["Blowjob", "blowjob"],["Body Swap", "body-swap"],["Bodysuit", "bodysuit"],["Bondage", "bondage"],["Booty", "booty"],["Bride", "bride"],["Bukkake", "bukkake"],["Bullying", "bullying"],["Bunny Girl", "bunny-girl"],["Business Suit", "business-suit"],["Busty", "busty"],["Censored", "censored"],["Cheating", "cheating"],["Cohabitation", "cohabitation"],["Collar", "collar"],["Comedy", "comedy"],["Condom", "condom"],["Cosplay", "cosplay"],["Cousin", "cousin"],["Cowgirl", "cowgirl"],["Creampie", "creampie"],["Crossdressing", "crossdressing"],["Cunnilingus", "cunnilingus"],["Dark Skin", "dark-skin"],["Daughter", "daughter"],["Deepthroat", "deepthroat"],["Defloration", "defloration"],["Demon", "demon"],["Demon Girl", "demon-girl"],["Dick Growth", "dick-growth"],["Digital", "digital"],["DILF", "dilf"],["Double Penetration", "double-penetration"],["Doujin", "doujin"],["Drama", "drama"],["Drugs", "drugs"],["Drunk", "drunk"],["Ecchi", "ecchi"],["Elf", "elf"],["Emotionless Sex", "emotionless-sex"],["Exhibitionism", "exhibitionism"],["Eyepatch", "eyepatch"],["Fantasy", "fantasy"],["Females Only", "females-only"],["Femdom", "femdom"],["Filming", "filming"],["Fingering", "fingering"],["Footjob", "footjob"],["Fuck Piercing", "fuck-piercing"],["Full Color", "full-color"],["Furry", "furry"],["Futanari", "futanari"],["Garter Belt", "garter-belt"],["Gender Bender", "gender-bender"],["Ghost", "ghost"],["Glasses", "glasses"],["Gloves", "gloves"],["Gokkun", "gokkun"],["Group", "group"],["Growth", "growth"],["Guro", "guro"],["Gyaru", "gyaru"],["Hairy", "hairy"],["Handjob", "handjob"],["Harem", "harem"],["Hidden Sex", "hidden-sex"],["Historical", "historical"],["Horns", "horns"],["Horror", "horror"],["Huge Breast", "huge-breast"],["Humiliation", "humiliation"],["Impregnation", "impregnation"],["Incest", "incest"],["Inflation", "inflation"],["Insect", "insect"],["Inseki", "inseki"],["Inverted Nipples", "inverted-nipples"],["Invisible", "invisible"],["Isekai", "isekai"],["Josei", "josei"],["Kemomimi", "kemomimi"],["Kimono", "kimono"],["Kissing", "kissing"],["Kuudere", "kuudere"],["Lactation", "lactation"],["Leotard", "leotard"],["Lingerie", "lingerie"],["Loli", "loli"],["Lolipai", "lolipai"],["Long Strip", "long-strip"],["Maid", "maid"],["Males Only", "males-only"],["Martial Arts", "martial-arts"],["Massage", "massage"],["Masturbation", "masturbation"],["Mating Press", "mating-press"],["Mature", "mature"],["Miko", "miko"],["MILF", "milf"],["Mind Break", "mind-break"],["Mind Control", "mind-control"],["Monster", "monster"],["Monster Girl", "monster-girl"],["Monsters", "monsters"],["Mother", "mother"],["Multi-work Series", "multi-work-series"],["Muscle", "muscle"],["Mystery", "mystery"],["Nakadashi", "nakadashi"],["Netorare", "netorare"],["Netorase", "netorase"],["Netori", "netori"],["Niece", "niece"],["Nipple", "nipple"],["Nipple Fuck", "nipple-fuck"],["Nipples", "nipples"],["No Penetration", "no-penetration"],["Nurse", "nurse"],["Old Man", "old-man"],["Original", "original"],["Osananajimi", "osananajimi"],["Oyakodon", "oyakodon"],["Paizuri", "paizuri"],["Pantyhose", "pantyhose"],["Piercing", "piercing"],["Ponytail", "ponytail"],["Possession", "possession"],["Pregnant", "pregnant"],["Prostitution", "prostitution"],["Psychological", "psychological"],["Pupils", "pupils"],["Rape", "rape"],["Regression", "regression"],["Rimjob", "rimjob"],["Romance", "romance"],["Scat", "scat"],["School Life", "school-life"],["School Uniform", "school-uniform"],["Sci-Fi", "sci-fi"],["Seinen", "seinen"],["Sex toys", "sex-toys"],["Shemale", "shemale"],["Shibari", "shibari"],["Shota", "shota"],["Shoujo", "shoujo"],["Shounen", "shounen"],["Sister", "sister"],["Sleeping", "sleeping"],["Slice of Life", "slice-of-life"],["Slime", "slime"],["Small Breast", "small-breast"],["Small Penis", "small-penis"],["Smell", "smell"],["Smut", "smut"],["Snuff", "snuff"],["Sole Female", "sole-female"],["Sole Male", "sole-male"],["Sports", "sports"],["Squirting", "squirting"],["Stocking", "stocking"],["Story Arc", "story-arc"],["Sumata", "sumata"],["Supernatural", "supernatural"],["Sweating", "sweating"],["Swimsuit", "swimsuit"],["Swinging", "swinging"],["Tail", "tail"],["Tall girl", "tall-girl"],["Tankoubon", "tankoubon"],["Tanlines", "tanlines"],["Teacher", "teacher"],["Tentacles", "tentacles"],["Threesome", "threesome"],["Tomboy", "tomboy"],["Tomgirl", "tomgirl"],["Torture", "torture"],["Tragedy", "tragedy"],["Tsundere", "tsundere"],["Twins", "twins"],["Twintails", "twintails"],["Ugly Bastard", "ugly-bastard"],["Uncensored", "uncensored"],["Unusual Pupils", "unusual-pupils"],["Vanilla", "vanilla"],["Virginity", "virginity"],["Voyeurism", "voyeurism"],["Widow", "widow"],["Wings", "wings"],["X-Ray", "x-ray"],["Yandere", "yandere"],["Yaoi", "yaoi"],["Yuri", "yuri"],]; // prettier-ignore

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => comics(page, { sort: 'popular' }),

    getLatest: (page) => comics(page, { sort: 'latest' }),

    search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof state[id] === 'string' && state[id] ? (state[id] as string) : undefined);
      const genres = GENRES.filter(([, slug]) => state[`genre.${slug}`] === true).map(([, slug]) => slug);
      return comics(page, {
        sort: text('sort') ?? 'latest',
        search: query.trim() || undefined,
        type: text('type'),
        status: text('status'),
        genre: genres.length > 0 ? genres.join(',') : undefined,
      });
    },

    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Urutan',
        options: [
          option('Terbaru', 'latest'),
          option('Terpopuler', 'popular'),
          option('A - Z', 'az'),
          option('Z - A', 'za'),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Tipe',
        options: [
          option('Semua', ''),
          option('Manhwa (Korea)', 'MANHWA'),
          option('Manga (Jepang)', 'MANGA'),
          option('Manhua (China)', 'MANHUA'),
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [option('Semua', ''), option('Ongoing', 'ONGOING'), option('Completed', 'END')],
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([label, slug]) => ({ type: 'checkbox', id: `genre.${slug}`, label })),
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { data } = await api<{ data: ComicDto }>(`${API_URL}/comics/${slugOf(manga.url)}`);
      const status = data.status?.toUpperCase() ?? '';
      const statuses: Record<string, MangaStatus> = { ONGOING: 'ongoing', END: 'completed', COMPLETED: 'completed' };
      return {
        ...toSummary(data),
        description: data.description || undefined,
        author: data.author || undefined,
        artist: data.artist || undefined,
        genres: data.genres?.map((g) => g.name),
        status: statuses[status] ?? 'unknown',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { data } = await api<{ data: ComicDto }>(`${API_URL}/comics/${slugOf(manga.url)}`);
      return (data.chapters ?? []).map((c) => {
        const number = c.number.trim();
        const time = c.publishedAt ? Date.parse(c.publishedAt) : Number.NaN;
        return {
          url: `/comic/${data.slug}/chapter/${number}#${c.id}`,
          name: `${c.isLocked ? '🔒 ' : ''}Chapter ${number}${c.title?.trim() ? ` - ${c.title.trim()}` : ''}`,
          number: Number.isFinite(Number.parseFloat(number)) ? Number.parseFloat(number) : undefined,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = chapter.url.includes('#') ? chapter.url.slice(chapter.url.lastIndexOf('#') + 1) : '';
      if (!chapterId) throw new Error('Please refresh the chapter list');
      // Signed request: HMAC-SHA256("GET:<path>:<timestamp>:<nonce>").
      const path = `/api/v1/chapters/${chapterId}/pages`;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const value = nonce(16);
      const signature = hmacSha256Hex(utf8.encode(SIGNING_KEY), utf8.encode(`GET:${path}:${timestamp}:${value}`));
      const { data } = await api<{ data: { locked?: boolean; pages?: { id: string; token: string }[] } }>(
        `${API_HOST}${path}`,
        {
          'x-app-timestamp': timestamp,
          'x-app-nonce': value,
          'x-app-signature': signature,
        },
      );
      if (data.locked) throw new Error('Chapter terkunci (Premium)');
      return (data.pages ?? []).map((page, index) => ({
        index,
        imageUrl: `${API_URL}/media/chapter/deliver?token=${encodeURIComponent(page.token)}`,
      }));
    },

    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:beta\.)?kumopoi\.(?:com|org)\/(?:comic|manga)\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/comic/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url.replace(/#.*$/, '')}`,
  }),
});
