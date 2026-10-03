import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, imgAttr, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://likemanga.ink';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adult', 'adult'],
  ['Adaptation', 'adaptation'],
  ['Adventure', 'adventure'],
  ['Anime', 'anime'],
  ['Comedy', 'comedy'],
  ['Completed', 'completed'],
  ['Cooking', 'cooking'],
  ['Crime', 'crime'],
  ['Crossdressin', 'crossdressin'],
  ['Delinquents', 'delinquents'],
  ['Demons', 'demons'],
  ['Detective', 'detective'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Fantasy', 'fantasy'],
  ['Game', 'game'],
  ['Ghosts', 'ghosts'],
  ['Harem', 'harem'],
  ['Historical', 'historical'],
  ['Horror', 'horror'],
  ['Isekai', 'isekai'],
  ['Josei', 'josei'],
  ['Magic', 'magic'],
  ['Magical', 'magical'],
  ['Manhua', 'manhua'],
  ['Manhwa', 'manhwa'],
  ['Martial Arts', 'martial-arts'],
  ['Mature', 'mature'],
  ['Mecha', 'mecha'],
  ['Medical', 'medical'],
  ['Military', 'military'],
  ['Moder', 'moder'],
  ['Monsters', 'monsters'],
  ['Music', 'music'],
  ['Mystery', 'mystery'],
  ['Office Workers', 'office-workers'],
  ['One shot', 'one-shot'],
  ['Philosophical', 'philosophical'],
  ['Police', 'police'],
  ['Reincarnation', 'reincarnation'],
  ['Reverse', 'reverse'],
  ['Reverse harem', 'reverse-harem'],
  ['Romance', 'romance'],
  ['Royal family', 'royal-family'],
  ['School Life', 'school-life'],
  ['Sci-fi', 'scifi'],
  ['Seinen', 'seinen'],
  ['Shoujo', 'shoujo'],
  ['Smut', 'smut'],
  ['Shoujo Ai', 'shoujo-ai'],
  ['Shounen', 'shounen'],
  ['Shounen Ai', 'shounen-ai'],
  ['Slice of Life', 'slice-of-life'],
  ['Sports', 'sports'],
  ['Super power', 'super-power'],
  ['Superhero', 'superhero'],
  ['Supernatural', 'supernatural'],
  ['Survival', 'survival'],
  ['Thriller', 'thriller'],
  ['Time Travel', 'time-travel'],
  ['Tragedy', 'tragedy'],
  ['Vampire', 'vampire'],
  ['Villainess', 'villainess'],
  ['Webtoons', 'webtoons'],
  ['Yaoi', 'yaoi'],
  ['Yuri', 'yuri'],
  ['Zombies', 'zombies'],
  ['Keyword', ''],
];
const IMAGE_ATTRS = ['data-cfsrc', 'data-src', 'data-lazy-src', 'src'];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function browse(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const params = ['act=searchadvance'];
  for (const [value] of GENRES)
    if (filters[`genre.${value}`] === true) params.push(`f[genres][]=${encodeURIComponent(value)}`);
  for (const id of ['min_num_chapter', 'status', 'sortby']) {
    const value = filters[id];
    if (typeof value === 'string' && value) params.push(`f[${id}]=${encodeURIComponent(value)}`);
  }
  if (query.trim()) params.push(`f[keyword]=${encodeURIComponent(query.trim())}`);
  if (page > 1) params.push(`pageNum=${page}`);
  const document = await load(`/?${params.join('&')}`);
  const items = document.select('div.card-body div.card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: card
          .select('.title-manga')
          .map((e) => e.text())
          .join(' '),
        thumbnailUrl: imgAttr(card.selectFirst('img'), IMAGE_ATTRS) || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('ul.pagination a:contains(»)') != null };
}

function parseChapters(document: HtmlElement): Chapter[] {
  return document.select('.wp-manga-chapter').flatMap((el): Chapter[] => {
    const link = el.selectFirst('a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        name: el
          .select('a')
          .map((a) => a.text())
          .join(' '),
        uploadedAt: parseDate(el.selectFirst('.chapter-release-date')?.text(), 'MMMM dd, yyyy'),
      },
    ];
  });
}

const decodeBase64 = (text: string) => {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return base64.decode(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(page, '', { sortby: 'top-manga' }),
    getLatest: (page) => browse(page, '', { sortby: 'lastest-chap' }),
    search: (query, page, filters) => browse(page, query, filters),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sortby',
        label: 'Sort by',
        options: [
          { label: '', value: '' },
          { label: 'Lasted update', value: 'lastest-chap' },
          { label: 'Lasted manga', value: 'lastest-manga' },
          { label: 'Top all', value: 'top-manga' },
          { label: 'Top month', value: 'top-month' },
          { label: 'Top week', value: 'top-week' },
          { label: 'Top day', value: 'top-day' },
          { label: 'Follow', value: 'follow' },
          { label: 'Comments', value: 'comment' },
          { label: 'Number of Chapters', value: 'num-chap' },
        ],
        default: '',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'All', value: '' },
          { label: 'Complete', value: 'Complete' },
          { label: 'In process', value: 'In process' },
          { label: 'Pause', value: 'Pause' },
        ],
        default: '',
      },
      {
        type: 'select',
        id: 'min_num_chapter',
        label: 'Chapter count',
        options: [
          { label: '', value: '' },
          ...['1', '50', '100', '200', '300', '400', '500'].map((n) => ({
            label: `>= ${n === '1' ? '0' : n} chapter`,
            value: n,
          })),
        ],
        default: '',
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([value, label]) => ({ type: 'checkbox', id: `genre.${value}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const status = document.selectFirst('.list-info .status p:nth-child(2)')?.text().toLowerCase() ?? '';
      const author = document.selectFirst('.list-info .author p:nth-child(2)')?.text().trim();
      return {
        url: manga.url,
        title:
          document
            .select('#title-detail-manga')
            .map((e) => e.text())
            .join(' ') || manga.title,
        thumbnailUrl: imgAttr(document.selectFirst('.detail-info img'), IMAGE_ATTRS) || manga.thumbnailUrl,
        description: document.selectFirst('#summary_shortened')?.text() || undefined,
        genres: document.select('.list-info a[href*=/genres/]').map((a) => a.text()),
        status: status.includes('complete')
          ? 'completed'
          : status.includes('in process')
            ? 'ongoing'
            : status.includes('pause')
              ? 'hiatus'
              : 'unknown',
        author: author && author !== 'Updating' ? author : undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const chapters = parseChapters(document);
      const onclick = document.select('div.chapters_pagination a:not(.next)').at(-1)?.attr('onclick') ?? '';
      const lastPage = Number(/load_list_chapter\((\d+)\)/.exec(onclick)?.[1] ?? 0);
      const mangaId = document.selectFirst('#title-detail-manga')?.attr('data-manga') ?? '';
      for (let page = 2; page <= lastPage; page++) {
        const response = await http.get(
          `${BASE_URL}/?act=ajax&code=load_list_chapter&manga_id=${mangaId}&page_num=${page}&chap_id=0&keyword=`,
          { headers },
        );
        const listChap = (JSON.parse(response.body) as { list_chap?: string }).list_chap ?? '';
        chapters.push(...parseChapters(html.load(listChap, { baseUrl: BASE_URL })));
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      const token = document.selectFirst('div.reading input#next_img_token')?.attr('value');
      if (token) {
        const cdn = document.selectFirst('div.reading #currentlink')?.attr('value');
        if (!cdn) throw new Error('Could not find image CDN URL');
        const data = (JSON.parse(decodeBase64(token.split('.')[1] ?? '')) as { data: string }).data;
        return (JSON.parse(decodeBase64(data)) as string[]).map((img, index) => ({
          index,
          imageUrl: `${cdn}/${img}`,
        }));
      }
      return document
        .select('div.reading-detail.box_doc img:not(noscript img)')
        .map((img, index) => ({ index, imageUrl: imgAttr(img, IMAGE_ATTRS) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+-\d+\/?)(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
