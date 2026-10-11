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
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl } from './common/utils';
import { speedBinbPagesFromDocument, speedBinbTransform } from './speedbinb';

const BASE_URL = 'https://kirapo.jp';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

type Doc = ReturnType<typeof html.load>;
async function load(url: string) {
  const res = await http.get(url, { headers });
  return { doc: html.load(res.body, { baseUrl: res.url }), url: res.url };
}

async function parseList(url: string): Promise<MangaPage> {
  const { doc } = await load(url);
  const items: MangaSummary[] = [];
  for (const a of doc.select('#titles-container a, .content-container .grid-group .w-auto a')) {
    const img = a.selectFirst('img');
    if (!img) continue;
    items.push({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: img.attr('alt') ?? '',
      thumbnailUrl: img.absUrl('src'),
    });
  }
  const readAt = doc.selectFirst('#more_titles_button')?.attr('data-read-at');
  if (!readAt) return { items, hasNextPage: false };
  const query = url.includes('?') ? `&${url.split('?')[1]}` : '';
  const api = await http.get<{ data: { name: string; url: string; thumbnail: string }[] }>(
    `${BASE_URL}/api/title-list?read_at=${encodeURIComponent(readAt)}${query}`,
    { headers, responseType: 'json' },
  );
  for (const t of api.body.data) items.push({ url: relativeUrl(t.url), title: t.name, thumbnailUrl: t.thumbnail });
  return { items, hasNextPage: false };
}

async function filterOptions(): Promise<{ name: string; key: string; value: string }[]> {
  const { doc } = await load(`${BASE_URL}/titles`);
  const out: { name: string; key: string; value: string }[] = [];
  const sections: [string, string][] = [
    ['label', 'レーベルから選ぶ'],
    ['genre', 'ジャンルから選ぶ'],
    ['category', 'カテゴリから選ぶ'],
  ];
  for (const [key, heading] of sections) {
    const h3 = doc.select('h3').find((h) => h.text().includes(heading));
    if (!h3) continue;
    // The links follow the heading in the next sibling block; locate it through the page html.
    const htmlText = doc.html();
    const idx = htmlText.indexOf(h3.html());
    const rest = htmlText.slice(idx + h3.html().length);
    const next = rest.split(/<h3\b/)[0] ?? '';
    for (const m of next.matchAll(/<a\b[^>]*href="[^"]*=([^"=]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      out.push({ name: m[2]!.replace(/<[^>]*>/g, '').trim(), key, value: m[1]! });
    }
  }
  return out;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    getPopular: () => parseList(`${BASE_URL}/titles`),
    async getFilters(): Promise<Filter[]> {
      const options = await filterOptions().catch(() => []);
      if (!options.length) return [];
      return [
        {
          type: 'select',
          id: 'filter',
          label: 'Filter by',
          options: [
            { value: '', label: 'All' },
            ...options.map((o) => ({ value: `${o.key}=${o.value}`, label: o.name })),
          ],
        },
      ];
    },
    search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return parseList(`${BASE_URL}/search?word=${encodeURIComponent(query)}`);
      const f = typeof filters.filter === 'string' ? filters.filter : '';
      return parseList(`${BASE_URL}/titles${f ? `?${f}` : ''}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      return {
        url: manga.url,
        title: doc.selectFirst('main h2')?.text().trim() ?? manga.title,
        author:
          doc
            .select('a[href*=/authors/]')
            .map((a) => a.text().trim())
            .join(', ') || undefined,
        description: doc.selectFirst('#plot + div')?.text().trim() || undefined,
        genres: doc.select('div.pt-5 a.button-gray').map((a) => a.text().trim()),
        thumbnailUrl: manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters: Chapter[] = [];
      for (const item of doc.select('.episodes-container .episode-item')) {
        if (item.text().includes('未公開話')) continue;
        const link = item.selectFirst('a');
        if (!link) continue;
        const seg = relativeUrl(link.absUrl('href') ?? '')
          .split('/')
          .filter(Boolean);
        chapters.push({
          url: `/pt/${seg[1]}/${seg[2]}/${seg[3]}/viewer`,
          name: item.selectFirst('.episode-item-left')?.text().trim() ?? seg[3] ?? '',
        });
      }
      if (chapters.length) return chapters;
      const link = doc.selectFirst('.header-side a.episode-read');
      if (!link) return [];
      const seg = relativeUrl(link.absUrl('href') ?? '')
        .split('/')
        .filter(Boolean);
      return [
        {
          url: `/pt/${seg[1]}/${seg[2]}/${seg[3]}/viewer`,
          name: doc.selectFirst('.latest-episode-title')?.text().trim() ?? seg[3] ?? '',
          uploadedAt: parseDate(doc.selectFirst('.last-update')?.text().split('更新')[0], 'yyyy年M月d日'),
        },
      ];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { doc, url } = await load(absoluteUrl(BASE_URL, chapter.url));
      return speedBinbPagesFromDocument(doc, url, { headers });
    },
    transformImage: speedBinbTransform,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
