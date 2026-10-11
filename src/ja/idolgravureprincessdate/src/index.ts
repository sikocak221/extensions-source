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
import { USER_AGENT, relativeUrl } from './common/utils';

const BASE_URL = 'https://idol.gravureprincess.date';
const MAX_RESULTS = 25;

const IDOLS = [
  'Nogizaka46',
  'AKB48',
  'NMB48',
  'Keyakizaka46',
  'HKT48',
  'SKE48',
  'NGT48',
  'SUPER☆GiRLS',
  'Morning Musume',
  'Dempagumi.inc',
  'Angerme',
  'Juice=Juice',
  'NijiCon-虹コン',
  'Houkago Princess',
  'Magical Punchline',
  'Idoling!!!',
  'Rev. from DVL',
  'Link STAR`s',
  'LADYBABY',
  '℃-ute',
  'Country Girls',
  'Up Up Girls (Kakko Kari)',
  'Yumemiru Adolescence',
  'Shiritsu Ebisu Chugaku',
  'Tenkoushoujo Kagekidan',
  'Drop',
  'Steam Girls',
  "Kamen Joshi's",
  'LinQ',
  'Doll☆Element',
  'TrySail',
  'Akihabara Backstage Pass',
  'Palet',
  'Passport☆',
  'Ange☆Reve',
  'BiSH',
  'Ciao Bella Cinquetti',
  'Gekidanherbest',
  'Haraeki Stage Ace',
  'Ru:Run',
  'SDN48',
];
const MAGAZINES = [
  'FLASH',
  'Weekly Playboy',
  'FRIDAY Magazine',
  'Young Jump',
  'Young Magazine',
  'BLT',
  'ENTAME',
  'EX-Taishu',
  'SPA! Magazine',
  'Young Gangan',
  'UTB',
  'Young Animal',
  'Young Champion',
  'Big Comic Spirtis',
  'Shonen Magazine',
  'BUBKA',
  'BOMB',
  'Shonen Champion',
  'Manga Action',
  'Weekly Shonen Sunday',
  'Photobooks',
  'BRODY',
  'Hustle Press',
  'ANAN Magazine',
  'SMART Magazine',
  'Young Sunday',
  'Gravure The Television',
  'CD&DL My Girl',
  'Daily LoGiRL',
  'Shukan Taishu',
  'Girls! Magazine',
  'Soccer Game King',
  'Weekly Georgia',
  'Sunday Magazine',
  'Mery Magazine',
];

interface Feed {
  feed: {
    category?: { term: string }[];
    entry?: {
      published: { $t: string };
      category?: { term: string }[];
      title: { $t: string };
      content: { $t: string };
      link: { rel: string; href: string }[];
    }[];
  };
}

const headers = { 'User-Agent': USER_AGENT };

function feedUrl(page: number, q?: string) {
  const start = MAX_RESULTS * (page - 1) + 1;
  return `${BASE_URL}/feeds/posts/default?alt=json&max-results=${MAX_RESULTS}&start-index=${start}${
    q ? `&q=${encodeURIComponent(q)}` : ''
  }`;
}

async function fetchFeed(url: string): Promise<Feed['feed']> {
  return (await http.get<Feed>(url, { headers, responseType: 'json' })).body.feed;
}

function toPage(feed: Feed['feed']): MangaPage {
  const entries = feed.entry ?? [];
  const items = entries.map((e) => {
    const link = e.link.find((l) => l.rel === 'alternate')!.href;
    const thumb = /<img[^>]*\bsrc="([^"]+)"/.exec(e.content.$t)?.[1];
    return {
      url: `${relativeUrl(link)}#${e.published.$t}`,
      title: e.title.$t,
      thumbnailUrl: thumb,
    };
  });
  return { items, hasNextPage: entries.length === MAX_RESULTS };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    async getPopular(page) {
      return toPage(await fetchFeed(feedUrl(page)));
    },
    async getFilters(): Promise<Filter[]> {
      const group = (id: string, label: string, names: string[]): Filter => ({
        type: 'group',
        id,
        label,
        filters: names.map((n): Filter => ({ type: 'checkbox', id: `label.${n}`, label: n })),
      });
      const filters = [group('idol', 'Idol', IDOLS), group('magazines', 'Magazines', MAGAZINES)];
      try {
        const known = new Set([...IDOLS, ...MAGAZINES]);
        const others = ((await fetchFeed(feedUrl(1))).category ?? []).map((c) => c.term).filter((t) => !known.has(t));
        if (others.length) filters.push(group('other', 'Other', others));
      } catch {
        // dynamic labels are optional
      }
      return filters;
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let q = '';
      for (const [id, v] of Object.entries(filters))
        if (id.startsWith('label.') && v === true) q += ` label:"${id.slice(6)}"`;
      if (query) q += ` ${query}`;
      return toPage(await fetchFeed(feedUrl(page, q.trim())));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return { url: manga.url, title: manga.title, thumbnailUrl: manga.thumbnailUrl, status: 'completed' };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const [path, date] = manga.url.split('#') as [string, string | undefined];
      return [{ url: path, name: 'Gallery', uploadedAt: date ? Date.parse(date) : undefined }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const res = await http.get(`${BASE_URL}${chapter.url}`, { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      return doc.select('div.post-body a:has(> img)').map((a, index) => ({ index, imageUrl: a.absUrl('href') ?? '' }));
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`.split('#')[0]!,
  }),
});
