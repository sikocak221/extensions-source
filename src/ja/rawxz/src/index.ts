import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, ownText, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://miuraw.com'; // was rawmiu.com
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SUFFIX = / \(Raw – Free\)$/;

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(url: string): Promise<MangaPage> {
  const doc = await load(url);
  const items = doc.select('.manga-card').map((el) => {
    const a = el.selectFirst('a.manga-card-thumb');
    return {
      url: relativeUrl(a?.absUrl('href') ?? ''),
      title: (el.selectFirst('.manga-card-title')?.text() ?? '').replace(SUFFIX, ''),
      thumbnailUrl: el.selectFirst('.manga-card-thumb img')?.absUrl('src'),
    };
  });
  return {
    items,
    hasNextPage: items.length >= 40 && selectIgnoreCase(doc, '.pagination a:has(i.fa-chevron-right)').length > 0,
  };
}

function parseStatus(text: string | undefined): MangaStatus {
  if (!text) return 'unknown';
  if (text.includes('連載中')) return 'ongoing';
  if (text.includes('完結')) return 'completed';
  return 'unknown';
}

function parseRelativeDate(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const amount = Number((text.split(' ')[0] ?? '').replace(/\D/g, ''));
  if (!amount) return undefined;
  const units: [string, number][] = [
    ['秒前', 1000],
    ['分前', 60_000],
    ['時間前', 3_600_000],
    ['日前', 86_400_000],
    ['週間前', 7 * 86_400_000],
    ['ヶ月前', 30 * 86_400_000],
    ['年前', 365 * 86_400_000],
  ];
  const unit = units.find(([k]) => text.includes(k));
  return unit ? Date.now() - amount * unit[1] : undefined;
}

function toProxyUrl(url: string): string {
  if (!url || url.includes('img-proxy.php?url=')) return url;
  return `${BASE_URL}/wp-content/themes/manga-theme-MangaVerse/img-proxy.php?url=${encodeURIComponent(url)}`;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${BASE_URL}/manga/page/${page}/?orderby=views`),
    getLatest: (page) => list(`${BASE_URL}/manga/page/${page}/?orderby=date`),
    search: (query, page) =>
      list(`${BASE_URL}/${page > 1 ? `page/${page}/` : ''}?s=${encodeURIComponent(query)}&post_type=manga`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const author = selectIgnoreCase(doc, '.md-meta-row:has(.fa-user) .md-meta-val')[0]?.text();
      return {
        url: manga.url,
        title: (doc.selectFirst('.md-title')?.text() ?? manga.title).replace(SUFFIX, ''),
        author: author && author !== '更新中' ? author : undefined,
        status: parseStatus(selectIgnoreCase(doc, '.md-meta-row:has(.fa-rss) .md-meta-val')[0]?.text()),
        genres: doc.select('.md-tag').map((t) => t.text()),
        description: doc.selectFirst('.md-desc-content')?.text(),
        thumbnailUrl: doc.selectFirst('.md-cover img')?.absUrl('src') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      return doc.select('.md-chapter-row').map((row) => {
        const link = row.selectFirst('.md-chapter-name a');
        return {
          url: relativeUrl(link?.absUrl('href') ?? ''),
          name: ownText(link),
          uploadedAt: parseRelativeDate(row.selectFirst('.md-chapter-time')?.text()),
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      if (chapter.url.startsWith('http')) throw new Error('この章のURLは古くなっています。マンガを更新してください。');
      const doc = await load(BASE_URL + chapter.url);
      return doc
        .select('.reader-page img')
        .map((img, index) => ({ index, imageUrl: toProxyUrl(img.absUrl('src') ?? '') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/manga\/[^/]+\/?$/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
