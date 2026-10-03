// MangaBox (Manganato family), ported from keiyoushi/extensions-source lib-multisrc/mangabox. This directory
// is a template: every extension using the theme keeps an identical copy in src/mangabox/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/manga/<slug>", chapter urls "/manga/<slug>/<chapter slug>". Not ported: merging split
// images and retrying other CDNs (the runtime has no request interceptors).
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, selectIgnoreCase } from './utils';

export const SORTS: FilterOption[] = [
  { label: 'Latest', value: 'latest' },
  { label: 'Newest', value: 'newest' },
  { label: 'Top read', value: 'topview' },
];

export const STATUSES: FilterOption[] = [
  { label: 'ALL', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Ongoing', value: 'ongoing' },
];

export const GENRES: FilterOption[] = [
  { label: 'ALL', value: 'all' },
  { label: '4-Koma', value: '4-koma' },
  { label: 'Action', value: 'action' },
  { label: 'Adaptation', value: 'adaptation' },
  { label: 'Adult', value: 'adult' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Age gap', value: 'age-gap' },
  { label: 'Ai art', value: 'ai-art' },
  { label: 'Aliens', value: 'aliens' },
  { label: 'Animals', value: 'animals' },
  { label: 'Anthology', value: 'anthology' },
  { label: 'Artbook', value: 'artbook' },
  { label: 'Avant garde', value: 'avant-garde' },
  { label: 'Award winning', value: 'award-winning' },
  { label: 'Beasts', value: 'beasts' },
  { label: 'Boys love', value: 'boys-love' },
  { label: 'Blackmail', value: 'blackmail' },
  { label: 'Bloody', value: 'bloody' },
  { label: 'Bodyswap', value: 'bodyswap' },
  { label: 'Brocon/Siscon', value: 'brocon-siscon' },
  { label: 'Cars', value: 'cars' },
  { label: 'Cartoon', value: 'cartoon' },
  { label: 'Cheating infidelity', value: 'cheating-infidelity' },
  { label: 'Childhood friends', value: 'childhood-friends' },
  { label: 'College life', value: 'college-life' },
  { label: 'Comedy', value: 'comedy' },
  { label: 'Comic', value: 'comic' },
  { label: 'Contest winning', value: 'contest-winning' },
  { label: 'Cooking', value: 'cooking' },
  { label: 'Creators', value: 'creators' },
  { label: 'Crime', value: 'crime' },
  { label: 'Crossdressing', value: 'crossdressing' },
  { label: 'Cultivation', value: 'cultivation' },
  { label: 'Death game', value: 'death-game' },
  { label: 'Degeneratemc', value: 'degeneratemc' },
  { label: 'Delinquents', value: 'delinquents' },
  { label: 'Dementia', value: 'dementia' },
  { label: 'Demons', value: 'demons' },
  { label: 'Doujinshi', value: 'doujinshi' },
  { label: 'Drama', value: 'drama' },
  { label: 'Ecchi', value: 'ecchi' },
  { label: 'Employee', value: 'employee' },
  { label: 'Erotica', value: 'erotica' },
  { label: 'Fan colored', value: 'fan-colored' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'Female protagonists', value: 'female-protagonists' },
  { label: 'Fetish', value: 'fetish' },
  { label: 'Full color', value: 'full-color' },
  { label: 'Game', value: 'game' },
  { label: 'Gender bender', value: 'gender-bender' },
  { label: 'Genderswap', value: 'genderswap' },
  { label: 'Ghosts', value: 'ghosts' },
  { label: 'Girls love', value: 'girls-love' },
  { label: 'Gore', value: 'gore' },
  { label: 'Gourmet', value: 'gourmet' },
  { label: 'Graphic novel', value: 'graphic-novel' },
  { label: 'Gyaru', value: 'gyaru' },
  { label: 'Harem', value: 'harem' },
  { label: 'Heartwarming', value: 'heartwarming' },
  { label: 'Hentai', value: 'hentai' },
  { label: 'Historical', value: 'historical' },
  { label: 'Horror', value: 'horror' },
  { label: 'Imageset', value: 'imageset' },
  { label: 'Incest', value: 'incest' },
  { label: 'Informative', value: 'informative' },
  { label: 'Isekai', value: 'isekai' },
  { label: 'Iyashikei', value: 'iyashikei' },
  { label: 'Josei', value: 'josei' },
  { label: 'Kids', value: 'kids' },
  { label: 'Korean', value: 'korean' },
  { label: 'Liexing', value: 'liexing' },
  { label: 'Loli', value: 'loli' },
  { label: 'Long strip', value: 'long-strip' },
  { label: 'Mafia', value: 'mafia' },
  { label: 'Magic', value: 'magic' },
  { label: 'Magical girls', value: 'magical-girls' },
  { label: 'Mahou shoujo', value: 'mahou-shoujo' },
  { label: 'Male protagonists', value: 'male-protagonists' },
  { label: 'Manga', value: 'manga' },
  { label: 'Mangatoon', value: 'mangatoon' },
  { label: 'Manhua', value: 'manhua' },
  { label: 'Manhwa', value: 'manhwa' },
  { label: 'Martial arts', value: 'martial-arts' },
  { label: 'Master servant', value: 'master-servant' },
  { label: 'Mature', value: 'mature' },
  { label: 'Mecha', value: 'mecha' },
  { label: 'Medical', value: 'medical' },
  { label: 'Military', value: 'military' },
  { label: 'Monsters', value: 'monsters' },
  { label: 'Monster girls', value: 'monster-girls' },
  { label: 'Murim', value: 'murim' },
  { label: 'Music', value: 'music' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Netorare', value: 'netorare' },
  { label: 'Netori', value: 'netori' },
  { label: 'Ninja', value: 'ninja' },
  { label: 'Non human', value: 'non-human' },
  { label: 'Office', value: 'office' },
  { label: 'Office workers', value: 'office-workers' },
  { label: 'Official colored', value: 'official-colored' },
  { label: 'Old people', value: 'old-people' },
  { label: 'Omegaverse', value: 'omegaverse' },
  { label: 'One shot', value: 'one-shot' },
  { label: 'Others', value: 'others' },
  { label: 'Overpowered', value: 'overpowered' },
  { label: 'Parody', value: 'parody' },
  { label: 'Philosophical', value: 'philosophical' },
  { label: 'Ping ping jun', value: 'ping-ping-jun' },
  { label: 'Police', value: 'police' },
  { label: 'Pornographic', value: 'pornographic' },
  { label: 'Post apocalyptic', value: 'post-apocalyptic' },
  { label: 'Psychological', value: 'psychological' },
  { label: 'Reincarnation', value: 'reincarnation' },
  { label: 'Revenge', value: 'revenge' },
  { label: 'Reverse', value: 'reverse' },
  { label: 'Reverse harem', value: 'reverse-harem' },
  { label: 'Romance', value: 'romance' },
  { label: 'Royal family', value: 'royal-family' },
  { label: 'Royalty', value: 'royalty' },
  { label: 'Samurai', value: 'samurai' },
  { label: 'School', value: 'school' },
  { label: 'School life', value: 'school-life' },
  { label: 'Sci fi', value: 'sci-fi' },
  { label: 'Science fiction', value: 'science-fiction' },
  { label: 'Seinen', value: 'seinen' },
  { label: 'Self published', value: 'self-published' },
  { label: 'Sexual violence', value: 'sexual-violence' },
  { label: 'Shota', value: 'shota' },
  { label: 'Shoujo', value: 'shoujo' },
  { label: 'Shoujo ai', value: 'shoujo-ai' },
  { label: 'Shounen', value: 'shounen' },
  { label: 'Shounen ai', value: 'shounen-ai' },
  { label: 'Showbiz', value: 'showbiz' },
  { label: 'Slice of life', value: 'slice-of-life' },
  { label: 'Smut', value: 'smut' },
  { label: 'Sm bdsm', value: 'sm-bdsm' },
  { label: 'Soft yaoi', value: 'soft-yaoi' },
  { label: 'Space', value: 'space' },
  { label: 'Sports', value: 'sports' },
  { label: 'Spy', value: 'spy' },
  { label: 'Step family', value: 'step-family' },
  { label: 'Super power', value: 'super-power' },
  { label: 'Superhero', value: 'superhero' },
  { label: 'Supernatural', value: 'supernatural' },
  { label: 'Survival', value: 'survival' },
  { label: 'Suspense', value: 'suspense' },
  { label: 'System', value: 'system' },
  { label: 'Teacher student', value: 'teacher-student' },
  { label: 'Thriller', value: 'thriller' },
  { label: 'Time travel', value: 'time-travel' },
  { label: 'Traditional games', value: 'traditional-games' },
  { label: 'Tragedy', value: 'tragedy' },
  { label: 'Vampires', value: 'vampires' },
  { label: 'Video games', value: 'video-games' },
  { label: 'Villainess', value: 'villainess' },
  { label: 'Violence', value: 'violence' },
  { label: 'Virtual reality', value: 'virtual-reality' },
  { label: 'Web comic', value: 'web-comic' },
  { label: 'Webtoons', value: 'webtoons' },
  { label: 'Western', value: 'western' },
  { label: 'Wuxia', value: 'wuxia' },
  { label: 'Xianxia', value: 'xianxia' },
  { label: 'Yaoi', value: 'yaoi' },
  { label: 'Yuri', value: 'yuri' },
  { label: 'Zombies', value: 'zombies' },
];

const FILTER_IDS: Record<string, string> = {
  'newest|all': '1',
  'newest|completed': '2',
  'newest|ongoing': '3',
  'latest|all': '4',
  'latest|completed': '5',
  'latest|ongoing': '6',
  'topview|all': '7',
  'topview|completed': '8',
  'topview|ongoing': '9',
};

export abstract class MangaBox {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  popularUrlPath = 'manga-list/hot-manga?page=';
  latestUrlPath = 'manga-list/latest-manga?page=';
  simpleQueryPath = 'search/story/';
  mangaDetailsMainSelector = 'div.manga-info-top, div.panel-story-info';
  thumbnailSelector = 'div.manga-info-pic img, span.info-image img';
  descriptionSelector = 'div#noidungm, div#panel-story-info-description, div#contentBox';
  altNameSelector = '.story-alternative, tr:has(.info-alternative) h2';
  altName = 'Alternative Name: ';

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<{ url: string; document: HtmlElement }> {
    const response = await http.get(url, { headers: this.headers() });
    return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
  }

  slugOf(url: string): string {
    return (
      url
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '')
        .split('/')
        .pop() ?? ''
    );
  }

  popularMangaSelector(): string {
    return ':is(div.truyen-list > div.list-truyen-item-wrap, div.comic-list > .list-comic-item-wrap):has(a[data-id])';
  }

  popularMangaNextPageSelector(): string {
    return 'div.group_page, div.group-page a:not([href]) + a:not(:contains(Last))';
  }

  searchMangaSelector(): string {
    return '.panel_story_list .story_item, div.list-truyen-item-wrap, div.list-comic-item-wrap';
  }

  searchMangaNextPageSelector(): string {
    return 'a.page_select + a:not(.page_last), a.page-select + a:not(.page-last)';
  }

  mangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('h3 a');
    return {
      url: `/manga/${this.slugOf(link?.absUrl('href') || link?.attr('href') || '')}`,
      title: link?.text() ?? '',
      thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
    };
  }

  async parseList(url: string, selector: string, nextSelector: string): Promise<MangaPage> {
    const { document } = await this.fetchDocument(url);
    const items = document
      .select(selector)
      .map((e) => this.mangaFromElement(e))
      .filter((m) => m.title && m.url !== '/manga/');
    return { items, hasNextPage: nextSelector !== '' && document.selectFirst(nextSelector) != null };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.parseList(
      `${this.baseUrl}/${this.popularUrlPath}${page}`,
      this.popularMangaSelector(),
      this.popularMangaNextPageSelector(),
    );
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.parseList(
      `${this.baseUrl}/${this.latestUrlPath}${page}`,
      this.popularMangaSelector(),
      this.popularMangaNextPageSelector(),
    );
  }

  normalizeSearchQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
      .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
      .replace(/[ìíịỉĩ]/g, 'i')
      .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
      .replace(/[ùúụủũưừứựửữ]/g, 'u')
      .replace(/[ỳýỵỷỹ]/g, 'y')
      .replace(/đ/g, 'd')
      .replace(/[!@%^*()+=<>?/,.:;' "&#[\]~\-$_]/g, '_')
      .replace(/_+_/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    let url: string;
    if (query.trim())
      url = `${this.baseUrl}/${this.simpleQueryPath}${encodeURIComponent(this.normalizeSearchQuery(query))}?page=${page}`;
    else {
      const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const genre = text('genre');
      const id = FILTER_IDS[`${text('sort') || SORTS[0]?.value}|${text('status') || STATUSES[0]?.value}`];
      url = `${this.baseUrl}/genre${genre ? `/${genre}` : ''}?${id ? `filter=${id}&` : ''}page=${page}`;
    }
    return this.parseList(url, this.searchMangaSelector(), this.searchMangaNextPageSelector());
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { document } = await this.fetchDocument(`${this.baseUrl}/manga/${this.slugOf(manga.url)}`);
    const details: MangaDetails = { url: manga.url, title: manga.title, status: 'unknown' };
    const info = document.selectFirst(this.mangaDetailsMainSelector);
    if (info) {
      details.title = info.selectFirst('h1, h2')?.text() || manga.title;
      details.author =
        selectIgnoreCase(info, 'li:contains(author) a, td:contains(author) + td a')
          .map((a) => a.text())
          .join(', ') || undefined;
      const status = selectIgnoreCase(info, 'li:contains(status), td:contains(status) + td')
        .map((e) => e.text())
        .join(' ');
      details.status = status.includes('Ongoing') ? 'ongoing' : status.includes('Completed') ? 'completed' : 'unknown';
      const kakalot = info.selectFirst('div.manga-info-top li:contains(Genres)');
      details.genres = (kakalot ? kakalot.select('a') : selectIgnoreCase(info, 'td:contains(genres) + td a')).map((a) =>
        a.text(),
      );
    } else if (document.selectFirst('body')?.text().startsWith('REDIRECT :')) {
      throw new Error('Source URL has changed');
    }
    let description = ownText(document.selectFirst(this.descriptionSelector))
      .replace(new RegExp(`^${details.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} summary:\\s`), '')
      .trim();
    const alt = ownText(document.selectFirst(this.altNameSelector));
    if (alt) description = description ? `${description}\n\n${this.altName}${alt}` : this.altName + alt;
    details.description = description || undefined;
    details.thumbnailUrl = document.selectFirst(this.thumbnailSelector)?.absUrl('src') || manga.thumbnailUrl;
    return details;
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = this.slugOf(manga.url);
    let data: {
      success?: boolean;
      data?: {
        chapters?: {
          chapter_name?: string | null;
          chapter_slug?: string | null;
          chapter_num?: number | null;
          updated_at?: string | null;
        }[];
      } | null;
    };
    try {
      data = (
        await http.get<typeof data>(`${this.baseUrl}/api/manga/${slug}/chapters?limit=-1`, {
          headers: this.headers(),
          responseType: 'json',
        })
      ).body;
    } catch (error) {
      log.warn('Cannot load chapters', error);
      return [];
    }
    if (!data.success) return [];
    return (data.data?.chapters ?? []).flatMap((c): Chapter[] => {
      if (!c.chapter_slug) return [];
      const time = c.updated_at ? Date.parse(c.updated_at) : Number.NaN;
      return [
        {
          url: `/manga/${slug}/${c.chapter_slug}`,
          name: c.chapter_name ?? 'Chapter',
          number: c.chapter_num ?? undefined,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        },
      ];
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const { document } = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    const content = document
      .select('script')
      .map((s) => s.html())
      .filter((data) => data.includes('cdns ='))
      .join('\n');
    const array = (name: string) =>
      (new RegExp(`${name}\\s*=\\s*\\[([^\\]]+)]`).exec(content)?.[1] ?? '')
        .split(',')
        .map((v) => v.trim().replace(/^"|"$/g, '').replace(/\\\//g, '/').replace(/\/$/, ''))
        .filter(Boolean);
    const cdns = [...array('cdns'), ...array('backupImage')];
    const images = array('chapterImages');
    const urls =
      images.length > 0 && cdns[0]
        ? images.map(
            (path) => `${cdns[0]!.replace(/^(https?:\/\/[^/]+).*$/, '$1')}${`/${path}`.replace(/\/\/+/g, '/')}`,
          )
        : document
            .select('div.container-chapter-reader > img')
            .map((img) => img.absUrl('src') || img.attr('src') || '');
    return urls.filter(Boolean).map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  getFilters(): Filter[] {
    return [
      { type: 'header', label: 'NOTE: Ignored if using text search!' },
      { type: 'separator' },
      { type: 'select', id: 'sort', label: 'Order by', options: SORTS },
      { type: 'select', id: 'status', label: 'Status', options: STATUSES },
      { type: 'select', id: 'genre', label: 'Category', options: GENRES },
    ];
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
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
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
