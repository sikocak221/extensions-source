import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

// The site prefixes every series and chapter slug with a rotating token ("/series/r2311170-<slug>").
// Stored urls leave it out; it is read from the series list and put back when a page is fetched.
const TOKEN = /^r\d+-/;

interface Comic {
  title: string;
  id: string;
  image_url?: string | null;
  long_description?: string | null;
  status?: string | null;
  type?: string | null;
  artist?: string | null;
  author?: string | null;
  serialization?: string | null;
  genre_id?: string | null;
}

const GENRES: [string, string][] = [["Abilities", "2"],["Action", "3"],["Adaptation", "4"],["Adventure", "5"],["Another Chance", "6"],["Apocalypse", "7"],["Based On A Novel", "8"],["Cheat", "9"],["Comedy", "10"],["Conspiracy", "11"],["Cultivation", "12"],["Demon", "13"],["Demon King", "14"],["Dragon", "15"],["Drama", "16"],["Drop", "17"],["Dungeon", "18"],["Dungeons", "19"],["Fantasy", "20"],["Game", "21"],["Genius", "22"],["Ghosts", "23"],["Harem", "24"],["Hero", "25"],["Hidden Identity", "26"],["HighFantasy", "27"],["Historical", "28"],["Horror", "29"],]; // prettier-ignore

/** The site's slug for a title (it is not in the API answer). */
function slugOf(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/'s/g, 's')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-ll-/g, 'll-')
    .replace(/^-+|-+$/g, '');
}

class RizzComic extends MangaThemesia {
  readonly name = 'Rizz Comic';
  readonly baseUrl = 'https://rizzfables.com';

  override mangaUrlDirectory = '/series';
  override datePattern = 'dd MMM yyyy';
  override pageSelector = 'div#readerarea > img';

  private token: { value: string; at: number } | null = null;

  async currentToken(): Promise<string> {
    if (this.token && Date.now() - this.token.at < 3_600_000) return this.token.value;
    const document = await this.fetchDocument(`${this.baseUrl}/series`);
    const href = document.selectFirst('div.bsx a')?.attr('href') ?? '';
    const value = /\/series\/(r\d+)-/.exec(href)?.[1] ?? '';
    this.token = { value, at: Date.now() };
    return value;
  }

  async liveUrl(path: string): Promise<string> {
    const token = await this.currentToken();
    const clean = path.replace(/#.*$/, '');
    return this.absolute(token ? clean.replace(/^\/(series|chapter)\//, `/$1/${token}-`) : clean);
  }

  override toRelative(url: string): string {
    return super.toRelative(url).replace(/^\/(series|chapter)\/r\d+-/, '/$1/');
  }

  apiHeaders(): Record<string, string> {
    return { ...this.headers(), 'X-Requested-With': 'XMLHttpRequest' };
  }

  override getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'popular' });
  }

  override getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'update' });
  }

  override async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
    let response;
    if (query.trim()) {
      response = await http.post(
        `${this.baseUrl}/Index/live_search`,
        { form: { search_value: query.trim() } },
        { headers: this.apiHeaders() },
      );
    } else {
      const text = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      const form: Record<string, string> = {
        StatusValue: text('status', 'all'),
        TypeValue: text('type', 'all'),
        OrderValue: text('order', 'all'),
      };
      GENRES.filter(([, id]) => filters[`genre.${id}`] === true).forEach(
        ([, id], i) => (form[`genres_checked[${i}]`] = id),
      );
      response = await http.post(`${this.baseUrl}/Index/filter_series`, { form }, { headers: this.apiHeaders() });
    }
    const comics = JSON.parse(response.body) as Comic[];
    return {
      items: comics.map((c) => ({
        url: `/series/${slugOf(c.title)}`,
        title: c.title,
        thumbnailUrl: c.image_url ? `${this.baseUrl}/assets/images/${c.image_url}` : undefined,
      })),
      hasNextPage: false,
    };
  }

  override async getFilters(): Promise<Filter[]> {
    const option = (label: string, value: string) => ({ label, value });
    return [
      { type: 'header', label: "Filters don't work with text search" },
      {
        type: 'select',
        id: 'order',
        label: 'Sort By',
        options: [
          option('Default', 'all'),
          option('A-Z', 'title'),
          option('Z-A', 'titlereverse'),
          option('Latest Update', 'update'),
          option('Latest Added', 'latest'),
          option('Popular', 'popular'),
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('All', 'all'),
          option('Ongoing', 'ongoing'),
          option('Complete', 'completed'),
          option('Hiatus', 'hiatus'),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [
          option('All', 'all'),
          ...['Manga', 'Manhwa', 'Manhua', 'Comic'].map((t) => option(t, t.toLowerCase())),
        ],
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([label, id]) => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
    ];
  }

  override async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const response = await http.get(await this.liveUrl(manga.url), { headers: this.headers() });
    const details = this.mangaDetailsParse(html.load(response.body, { baseUrl: response.url }), manga);
    return { ...details, url: manga.url };
  }

  override async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(await this.liveUrl(manga.url));
    await timers.sleep(0);
    return this.chapterListParse(document);
  }

  override async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(await this.liveUrl(chapter.url), { headers: this.headers() });
    return this.pageListParse(html.load(response.body, { baseUrl: response.url }), response.body);
  }

  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/(?:www\.)?rizzfables\.com\/series\/(?:r\d+-)?([^/?#]+)/i.exec(url.trim());
    return match ? { url: `/series/${match[1]}`, title: '' } : null;
  }

  override getWebUrl(item: MangaSummary | Chapter): string {
    return this.absolute(item.url);
  }
}

export default defineExtension({
  createSource: () => new RizzComic().toSource(),
});
