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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://eggporncomics.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CATEGORIES = [
  { label: 'Any', value: '' },
  { label: '3d comics', value: '7/3d-comics' },
  { label: 'Anime Comics', value: '1/anime-comics' },
  { label: 'Cartoon', value: '2/cartoon' },
  { label: 'Dickgirls & Shemale', value: '6/dickgirls-shemale' },
  { label: 'Doujinshi', value: '19/doujinshi' },
  { label: 'Furry', value: '4/furry' },
  { label: 'Games comics', value: '3/games-comics' },
  { label: 'Hentai manga', value: '10/hentai-manga' },
  { label: 'Interracial', value: '14/interracial' },
  { label: 'Milf', value: '11/milf' },
  { label: 'Mindcontrol', value: '15/mindcontrol' },
  { label: 'Western', value: '12/western' },
  { label: 'Yaoi and Gay', value: '8/yaoi-and-gay' },
  { label: 'Yuri and Lesbian', value: '9/yuri-and-lesbian' },
];
const COMICS = [
  { label: 'Any', value: '' },
  { label: '3d', value: '85/3d' },
  { label: 'Adventure Time', value: '2950/adventure-time' },
  { label: 'Anal', value: '13/anal' },
  { label: 'Ben 10', value: '641/ben10' },
  { label: 'Big boobs', value: '3025/big-boobs' },
  { label: 'Big breasts', value: '6/big-breasts' },
  { label: 'Big cock', value: '312/big-cock' },
  { label: 'Bigass', value: '604/big-ass-porn-comics-new' },
  { label: 'Black cock', value: '2990/black-cock' },
  { label: 'Blowjob', value: '7/blowjob' },
  { label: 'Bondage', value: '24/bondage' },
  { label: 'Breast expansion hentai', value: '102/breast-expansion-new' },
  { label: 'Cumshot', value: '427/cumshot' },
  { label: 'Dark skin', value: '29/dark-skin' },
  { label: 'Dofantasy', value: '1096/dofantasy' },
  { label: 'Double penetration', value: '87/double-penetration' },
  { label: 'Doujin moe', value: '3028/doujin-moe' },
  { label: 'Erotic', value: '602/erotic' },
  { label: 'Fairy tail porn', value: '3036/fairy-tail' },
  { label: 'Fakku', value: '1712/Fakku-Comics-new' },
  { label: 'Fakku comics', value: '1712/fakku-comics-new' },
  { label: 'Family Guy porn', value: '774/family-guy' },
  { label: 'Fansadox', value: '1129/fansadox-collection' },
  { label: 'Feminization', value: '385/feminization' },
  { label: 'Forced', value: '315/forced' },
  { label: 'Full color', value: '349/full-color' },
  { label: 'Furry', value: '19/furry' },
  { label: 'Futanari', value: '2994/futanari' },
  { label: 'Group', value: '58/group' },
  { label: 'Hardcore', value: '304/hardcore' },
  { label: 'Harry Potter porn', value: '338/harry-potter' },
  { label: 'Hentai', value: '321/hentai' },
  { label: 'Incest', value: '3007/incest' },
  { label: 'Incest - Family Therapy Top', value: '3007/family-therapy-top' },
  { label: 'Incognitymous', value: '545/incognitymous' },
  { label: 'Interracical', value: '608/interracical' },
  { label: 'Jab Comix', value: '1695/JAB-Comics-NEW-2' },
  { label: 'Kaos comics', value: '467/kaos' },
  { label: 'Kim Possible porn', value: '788/kim-possible' },
  { label: 'Lesbian', value: '313/lesbian' },
  { label: 'Locofuria', value: '343/locofuria' },
  { label: 'Milf', value: '48/milf' },
  { label: 'Milftoon', value: '1678/milftoon-comics' },
  { label: 'Muscle', value: '2/muscle' },
  { label: 'Nakadashi', value: '10/nakadashi' },
  { label: 'PalComix', value: '373/palcomix' },
  { label: 'Pokemon hentai', value: '657/pokemon' },
  { label: 'Shadbase', value: '1717/shadbase-comics' },
  { label: 'Shemale', value: '126/shemale' },
  { label: 'Slut', value: '301/slut' },
  { label: 'Sparrow hentai', value: '3035/sparrow-hentai' },
  { label: 'Star Wars hentai', value: '1344/star-wars' },
  { label: 'Stockings', value: '51/stockings' },
  { label: 'Superheroine Central', value: '615/superheroine-central' },
  { label: 'The Cummoner', value: '3034/the-cummoner' },
  { label: 'The Rock Cocks', value: '3031/the-rock-cocks' },
  { label: 'ZZZ Comics', value: '1718/zzz-comics' },
];

async function load(url: string) {
  const response = await http.request<string>({ url: absoluteUrl(BASE_URL, url), headers });
  return { status: response.status, url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
}

function parseList(document: HtmlElement): MangaPage {
  const items = document.select('div.preview:has(div.name)').flatMap((preview): MangaSummary[] => {
    const a = preview.selectFirst('a:has(img)');
    if (!a) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: a.text() || (a.selectFirst('img')?.attr('alt') ?? ''),
        thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('ul.ne-pe li.next:not(.disabled)') != null };
}

async function list(url: string): Promise<MangaPage> {
  const { status, document } = await load(url);
  if (status === 404 && url.includes('category-tag')) return { items: [], hasNextPage: false };
  if (status >= 400) throw new Error(`HTTP error ${status}`);
  return parseList(document);
}

const fullSize = (img: HtmlElement) => (img.absUrl('src') || '').replace('thumb300_', '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/category/1/anime-comics?page=${page}`),
    getLatest: (page) => list(`/latest-comics?page=${page}`),
    search(query: string, page: number, filters: FilterState) {
      if (query.trim()) return list(`/search/${query.trim().replace(/[\s']/g, '-')}?page=${page}`);
      const category = typeof filters.category === 'string' ? filters.category : '';
      const comics = typeof filters.comics === 'string' ? filters.comics : '';
      const path =
        category && comics
          ? `/category-tag/${category}/${comics}`
          : category
            ? `/category/${category}`
            : comics
              ? `/comics-tag/${comics}`
              : '/';
      return list(`${path}?page=${page}`);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Leave query blank to use filters' },
      { type: 'separator' },
      { type: 'select', id: 'category', label: 'Category', options: CATEGORIES },
      { type: 'select', id: 'comics', label: 'Comics', options: COMICS },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const img = document.selectFirst('div.grid div.image img');
      const description = document
        .select('div.links ul')
        .map(
          (ul) =>
            `${ul
              .select('span')
              .map((s) => s.text())
              .join(' ')
              .replace(/:.*/, ': ')}${ul
              .select('a')
              .map((a) => a.text())
              .join(', ')}`,
        )
        .join('\n');
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: img ? fullSize(img) : manga.thumbnailUrl,
        description: description || undefined,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { url, document } = await load(manga.url);
      const ago = document
        .select('div.info > div.meta li')
        .find((li) => li.text().includes('days ago'))
        ?.text();
      const days = Number.parseInt(ago ?? '', 10);
      return [
        {
          url: relativeUrl(url),
          name: 'Chapter',
          uploadedAt: Number.isNaN(days) ? undefined : Date.now() - days * 86_400_000,
        },
      ];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      return document.select('div.grid div.image img').map((img, index) => ({ index, imageUrl: fullSize(img) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/comics\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
