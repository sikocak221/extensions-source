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
import { USER_AGENT, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://misskon.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromElement(element: HtmlElement): MangaSummary | null {
  const titleEl = element.selectFirst('.post-box-title');
  const link = titleEl?.selectFirst('a');
  if (!titleEl || !link) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title: titleEl.text(),
    thumbnailUrl: element.selectFirst('.post-thumbnail img')?.absUrl('data-src') || undefined,
  };
}

const list = (document: HtmlElement, nextSelector: string): MangaPage => ({
  items: document.select('article.item-list').flatMap((el) => mangaFromElement(el) ?? []),
  hasNextPage: document.selectFirst(nextSelector) != null,
});

const tags = (group: string, items: [string, string][]): [string, string][] =>
  items.map(([name, slug]) => [`${group}:${name}`, `/tag/${slug}/`]);

const CATEGORIES: [string, string][] = [
  ['Top 3 days', '/top3/'],
  ['Top 7 days', '/top7/'],
  ['Top 30 days', '/top30/'],
  ['Top 60 days', '/top60/'],
  ...tags('Chinese', [
    ['[MTCos] 喵糖映画', 'mtcos'], ['BoLoli', 'bololi'], ['CANDY', 'candy'], ['FEILIN', 'feilin'], ['FToow', 'ftoow'],
    ['GIRLT', 'girlt'], ['HuaYan', 'huayan'], ['HuaYang', 'huayang'], ['IMISS', 'imiss'], ['ISHOW', 'ishow'],
    ['JVID', 'jvid'], ['KelaGirls', 'kelagirls'], ['Kimoe', 'kimoe'], ['LegBaby', 'legbaby'], ['MF', 'mf'],
    ['MFStar', 'mfstar'], ['MiiTao', 'miitao'], ['MintYe', 'mintye'], ['MISSLEG', 'missleg'], ['MiStar', 'mistar'],
    ['MTMeng', 'mtmeng'], ['MyGirl', 'mygirl'], ['PartyCat', 'partycat'], ['QingDouKe', 'qingdouke'],
    ['RuiSG', 'ruisg'], ['SLADY', 'slady'], ['TASTE', 'taste'], ['TGOD', 'tgod'], ['TouTiao', 'toutiao'],
    ['TuiGirl', 'tuigirl'], ['Tukmo', 'tukmo'], ['UGIRLS', 'ugirls'], ['UGIRLS - Ai You Wu App', 'ugirls-ai-you-wu-app'],
    ['UXING', 'uxing'], ['WingS', 'wings'], ['XiaoYu', 'xiaoyu'], ['XingYan', 'xingyan'], ['XIUREN', 'xiuren'],
    ['XR Uncensored', 'xr-uncensored'], ['YouMei', 'youmei'], ['YouMi', 'youmi'], ['YouMi尤蜜', 'youmiapp'],
    ['YouWu', 'youwu'],
  ]),
  ...tags('Korean', [
    ['AG', 'ag'], ['Bimilstory', 'bimilstory'], ['BLUECAKE', 'bluecake'], ['CreamSoda', 'creamsoda'],
    ['DJAWA', 'djawa'], ['Espacia Korea', 'espacia-korea'], ['Fantasy Factory', 'fantasy-factory'],
    ['Fantasy Story', 'fantasy-story'], ['Glamarchive', 'glamarchive'], ['HIGH FANTASY', 'high-fantasy'],
    ['KIMLEMON', 'kimlemon'], ['KIREI', 'kirei'], ['KiSiA', 'kisia'], ['Korean Realgraphic', 'korean-realgraphic'],
    ['Lilynah', 'lilynah'], ['Lookas', 'lookas'], ['Loozy', 'loozy'], ['Moon Night Snap', 'moon-night-snap'],
    ['Paranhosu', 'paranhosu'], ['PhotoChips', 'photochips'], ['Pure Media', 'pure-media'], ['PUSSYLET', 'pussylet'],
    ['SAINT Photolife', 'saint-photolife'], ['SWEETBOX', 'sweetbox'], ['UHHUNG MAGAZINE', 'uhhung-magazine'],
    ['UMIZINE', 'umizine'], ['WXY ENT', 'wxy-ent'], ['Yo-U', 'yo-u'],
  ]),
  ...tags('Other', [['AI Generated', 'ai-generated'], ['Cosplay', 'cosplay'], ['JP', 'jp'], ['JVID', 'jvid'], ['Patreon', 'patreon']]),
]; // prettier-ignore

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(): Promise<MangaPage> {
      return list(await fetchDocument(`${BASE_URL}/top3/`), '.nothing');
    },

    async getLatest(page: number): Promise<MangaPage> {
      return list(await fetchDocument(`${BASE_URL}/page/${page}`), '.current + a.page');
    },

    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'NOTE: Unable to further search in the category!' },
        { type: 'separator' },
        {
          type: 'select',
          id: 'category',
          label: 'Category',
          options: [{ label: 'unselected', value: '' }, ...CATEGORIES.map(([label, value]) => ({ label, value }))],
        },
      ];
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const category = typeof state.category === 'string' ? state.category : '';
      const url = category ? `${BASE_URL}${category}` : withQuery(`${BASE_URL}/page/${page}/`, { s: query });
      return list(await fetchDocument(url), 'div.content > div.pagination > span.current + a');
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const inner = document.selectFirst('article > .post-inner');
      return {
        url: manga.url,
        title: inner?.selectFirst('.post-title')?.text() || manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        genres: inner?.select('.post-tag > a').map((a) => a.text()) ?? [],
        status: 'completed',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const imageUrl = document.selectFirst('.entry img')?.absUrl('data-src');
      const full = imageUrl ? /\/(\d{4}\/\d{2}\/\d{2})\//.exec(imageUrl)?.[1] : undefined;
      const month = imageUrl ? /\/(\d{4}\/\d{2})\//.exec(imageUrl)?.[1] : undefined;
      const uploadedAt = parseDate(full ?? (month ? `${month}/01` : undefined), 'yyyy/MM/dd');
      const maxPage =
        Number.parseInt(document.select('div.page-link:first-of-type a.post-page-numbers').pop()?.text() ?? '', 10) ||
        1;
      return Array.from({ length: maxPage }, (_, i) => maxPage - i).map((page) => ({
        url: `${manga.url.replace(/\/$/, '')}/${page}`,
        name: `Page ${page}`,
        number: page,
        uploadedAt,
      }));
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('div.post-inner > div.entry > p > img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.absUrl('src') || '' }))
        .filter((p) => p.imageUrl);
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?misskon\.com(\/[^/?#]+\/?)$/i.exec(url.trim());
      return match && !/^\/(top\d+|tag|page|category)\b/.test(match[1]!) ? { url: match[1]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
