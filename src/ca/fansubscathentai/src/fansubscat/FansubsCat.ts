// Fansubs.cat (JSON API), ported from keiyoushi/extensions-source lib-multisrc/fansubscat. This directory
// is a template: every extension using the theme keeps an identical copy in src/fansubscat/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/<slug>", chapter urls "/<slug>/<chapter id>".
import type {
  Chapter,
  Filter,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { hostOf } from './utils';

interface ResultDto<T> {
  result: T;
}

interface MangaDto {
  slug: string;
  name: string;
  thumbnail_url?: string | null;
  author?: string | null;
  synopsis?: string | null;
  status?: string | null;
  genres?: string | null;
}

interface ChapterDto {
  id: string;
  title: string;
  number: number;
  fansub?: string | null;
  created?: number | null;
}

interface PageDto {
  url: string;
}

type Tag = [id: number, label: string];

const MANGA_TYPES: [string, string][] = [
  ['oneshot', 'One-shots'],
  ['serialized', 'Serialitzats'],
];

const STATES: Tag[] = [
  [1, 'Completat'],
  [2, 'En procés'],
  [3, 'Parcialment completat'],
  [4, 'Abandonat'],
  [5, 'Cancel·lat'],
];

const DEMOGRAPHIES: Tag[] = [
  [35, 'Infantil'],
  [27, 'Josei'],
  [12, 'Seinen'],
  [16, 'Shōjo'],
  [1, 'Shōnen'],
  [-1, 'No definida'],
];

const GENRES: Tag[] = [
  [4, 'Acció'],
  [7, 'Amor'],
  [38, 'Amor entre noies'],
  [23, 'Amor entre nois'],
  [31, 'Avantguardisme'],
  [6, 'Aventura'],
  [10, 'Ciència-ficció'],
  [2, 'Comèdia'],
  [47, 'De prestigi'],
  [3, 'Drama'],
  [19, 'Ecchi'],
  [46, 'Erotisme'],
  [20, 'Esports'],
  [5, 'Fantasia'],
  [48, 'Gastronomia'],
  [34, 'Hentai'],
  [11, 'Misteri'],
  [8, 'Sobrenatural'],
  [17, 'Suspens'],
  [21, 'Terror'],
  [42, 'Vida quotidiana'],
];

const THEMES: Tag[] = [
  [71, 'Animals de companyia'],
  [50, 'Antropomorfisme'],
  [70, 'Arts escèniques'],
  [18, 'Arts marcials'],
  [81, 'Arts visuals'],
  [64, 'Canvi de gènere màgic'],
  [56, 'Comèdia de gags'],
  [68, 'Crim organitzat'],
  [69, 'Cultura otaku'],
  [30, 'Curses'],
  [54, 'Delinqüència'],
  [43, 'Detectivesc'],
  [55, 'Educatiu'],
  [9, 'Escolar'],
  [39, 'Espai'],
  [77, 'Esports d’equip'],
  [53, 'Esports de combat'],
  [25, 'Harem'],
  [73, 'Harem invers'],
  [15, 'Històric'],
  [59, 'Idols femenines'],
  [60, 'Idols masculins'],
  [75, 'Indústria de l’entreteniment'],
  [61, 'Isekai'],
  [58, 'Joc d’alt risc'],
  [33, 'Joc d’estratègia'],
  [82, 'Laboral'],
  [29, 'Mecha'],
  [66, 'Medicina'],
  [67, 'Memòries'],
  [22, 'Militar'],
  [32, 'Mitologia'],
  [26, 'Música'],
  [65, 'Noies màgiques'],
  [36, 'Paròdia'],
  [49, 'Personatges adults'],
  [51, 'Personatges bufons'],
  [63, 'Polígon amorós'],
  [13, 'Psicològic'],
  [52, 'Puericultura'],
  [72, 'Reencarnació'],
  [62, 'Relaxant'],
  [74, 'Rerefons romàntic'],
  [37, 'Samurais'],
  [57, 'Sang i fetge'],
  [40, 'Superpoders'],
  [76, 'Supervivència'],
  [80, 'Tirana'],
  [45, 'Transformisme'],
  [41, 'Vampirs'],
  [78, 'Viatges en el temps'],
  [79, 'Videojocs'],
];

export abstract class FansubsCat {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly isHentaiSite: boolean;

  get apiBaseUrl(): string {
    return this.baseUrl.replace('https://manga.', 'https://api.');
  }

  headers(): Record<string, string> {
    return { 'User-Agent': 'Tachiyomi/Matane' };
  }

  async api<T>(path: string): Promise<T> {
    return (
      await http.get<ResultDto<T>>(`${this.apiBaseUrl}${path}`, { headers: this.headers(), responseType: 'json' })
    ).body.result;
  }

  toSummary(dto: MangaDto): MangaSummary {
    return { url: `/${dto.slug}`, title: dto.name, thumbnailUrl: dto.thumbnail_url || undefined };
  }

  parseMangaList(list: MangaDto[]): MangaPage {
    return { items: list.map((dto) => this.toSummary(dto)), hasNextPage: list.length >= 20 };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseMangaList(await this.api<MangaDto[]>(`/manga/popular/${page}`));
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseMangaList(await this.api<MangaDto[]>(`/manga/recent/${page}`));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [];
    const checked = (prefix: string, tags: [string | number, string][]) =>
      tags.filter(([id]) => filters[`${prefix}.${id}`] === true).map(([id]) => String(id));
    const oneShot = checked('type', MANGA_TYPES).includes('oneshot');
    const serialized = checked('type', MANGA_TYPES).includes('serialized');
    params.push(['type', oneShot && !serialized ? 'oneshot' : !oneShot && serialized ? 'serialized' : 'all']);
    for (const id of checked('state', STATES)) params.push(['status[]', id]);
    if (!this.isHentaiSite) for (const id of checked('demography', DEMOGRAPHIES)) params.push(['demographies[]', id]);
    for (const [prefix, key, tags] of [
      ['genre', 'genres', GENRES],
      ['theme', 'themes', THEMES],
    ] as const) {
      for (const [id] of tags) {
        const value = filters[`${prefix}.${id}`];
        if (value === 'include') params.push([`${key}_include[]`, String(id)]);
        else if (value === 'exclude') params.push([`${key}_exclude[]`, String(id)]);
      }
    }
    if (query.trim()) params.push(['query', query]);
    const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return this.parseMangaList(await this.api<MangaDto[]>(`/manga/search/${page}?${qs}`));
  }

  slugOf(url: string): string {
    return url.replace(/^\/+/, '').split('/')[0] ?? '';
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const dto = await this.api<MangaDto>(`/manga/details/${this.slugOf(manga.url)}`);
    const status = dto.status ?? '';
    return {
      ...this.toSummary(dto),
      author: dto.author || undefined,
      description: dto.synopsis || undefined,
      genres: dto.genres
        ?.split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      status: (/ongoing/i.test(status) ? 'ongoing' : /finished/i.test(status) ? 'completed' : 'unknown') as MangaStatus,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const list = await this.api<ChapterDto[]>(`/manga/chapters/${this.slugOf(manga.url)}`);
    return list.map((dto) => ({
      url: `/${dto.id}`,
      name: dto.title,
      number: dto.number,
      scanlator: dto.fansub || undefined,
      uploadedAt: dto.created || undefined,
    }));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const pages = await this.api<PageDto[]>(`/manga/pages/${chapter.url.replace(/^\/+/, '').split('/').pop()}`);
    return pages.map((page, index) => ({ index, imageUrl: page.url }));
  }

  getFilters(): Filter[] {
    const checkboxes = (prefix: string, tags: [string | number, string][]): Filter[] =>
      tags.map(([id, label]) => ({ type: 'checkbox', id: `${prefix}.${id}`, label }));
    const tristates = (prefix: string, tags: Tag[]): Filter[] =>
      tags.map(([id, label]) => ({ type: 'tristate', id: `${prefix}.${id}`, label }));
    return [
      { type: 'group', id: 'type', label: 'Tipus', filters: checkboxes('type', MANGA_TYPES) },
      { type: 'group', id: 'state', label: 'Estat', filters: checkboxes('state', STATES) },
      ...(this.isHentaiSite
        ? []
        : [
            {
              type: 'group',
              id: 'demography',
              label: 'Demografies',
              filters: checkboxes('demography', DEMOGRAPHIES),
            } as Filter,
          ]),
      {
        type: 'group',
        id: 'genre',
        label: 'Gèneres (inclou/exclou)',
        filters: tristates('genre', this.isHentaiSite ? GENRES : GENRES.filter(([id]) => id !== 34)),
      },
      { type: 'group', id: 'theme', label: 'Temàtiques (inclou/exclou)', filters: tristates('theme', THEMES) },
    ];
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    const path = item.url.replace(/^\/+/, '');
    return `${this.baseUrl}/${path.includes('/') ? path.replace('/', '?f=') : path}`;
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      getLatest: (page) => this.getLatest(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
