import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://saymanhwa.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SITE_LANG: Record<string, string> = { pt: 'pt-br', zh: 'zh-cn', 'zh-Hans': 'zh-cn', 'zh-Hant': 'zh-tw' };

const STATUS_WORDS: Record<string, [string[], string[]]> = {
  ar: [['مستمر'], ['مكتمل']],
  de: [['laufend'], ['abgeschlossen']],
  es: [['en curso'], ['completado']],
  fil: [['tuloy-tuloy', 'tuloy tuloy'], ['tapos']],
  fr: [['en cours'], ['terminé', 'termine']],
  id: [['berjalan'], ['selesai']],
  ja: [['連載中'], ['完結']],
  'pt-br': [['em andamento'], ['concluído', 'concluido']],
  th: [['กำลังดำเนิน'], ['จบแล้ว']],
  vi: [['đang tiến hành', 'đang'], ['hoàn thành']],
  'zh-cn': [
    ['连载中', '連載中'],
    ['已完结', '已完結', '完结', '完結'],
  ],
  'zh-tw': [
    ['连载中', '連載中'],
    ['已完结', '已完結', '完结', '完結'],
  ],
};

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaPage(document: HtmlElement): MangaPage {
  const items = document.select('article.series-card').flatMap((el): MangaSummary[] => {
    const link = el.selectFirst('.series-card-body h2 a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: el.selectFirst('.series-card-cover img, a img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.select('nav.pagination span + a').length > 0 };
}

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const lang = SITE_LANG[info.lang] ?? info.lang;
    const pageParam = (page: number): Record<string, string> => (page > 1 ? { page: String(page) } : {});

    const toStatus = (text: string | undefined): MangaStatus => {
      if (!text) return 'unknown';
      const [ongoing, completed] = STATUS_WORDS[lang] ?? [['ongoing'], ['completed']];
      const value = text.toLowerCase();
      if (ongoing!.some((w) => value.includes(w.toLowerCase()))) return 'ongoing';
      if (completed!.some((w) => value.includes(w.toLowerCase()))) return 'completed';
      return 'unknown';
    };

    return {
      baseUrl: BASE_URL,

      async getPopular(page: number): Promise<MangaPage> {
        return parseMangaPage(await fetchDocument(withQuery(`${BASE_URL}/${lang}/popular`, pageParam(page))));
      },

      async getLatest(page: number): Promise<MangaPage> {
        return parseMangaPage(await fetchDocument(withQuery(`${BASE_URL}/${lang}/latest`, pageParam(page))));
      },

      async getFilters(): Promise<Filter[]> {
        try {
          const document = await fetchDocument(`${BASE_URL}/${lang}/series`);
          const options = document.select('select[name=genre] option').flatMap((o) => {
            const value = o.attr('value');
            const label = o.text();
            return value && label ? [{ label, value }] : [];
          });
          return options.length
            ? [{ type: 'select', id: 'genre', label: 'Genre', options: [{ label: 'All', value: '' }, ...options] }]
            : [];
        } catch {
          return [];
        }
      },

      async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
        const params: Record<string, string> = { ...pageParam(page) };
        if (query.trim()) params.q = query.trim();
        if (typeof state.genre === 'string' && state.genre) params.genre = state.genre;
        return parseMangaPage(await fetchDocument(withQuery(`${BASE_URL}/${lang}/series`, params)));
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const document = await fetchDocument(`${BASE_URL}${manga.url}`);
        const creators = document.select('.series-v72-meta-row strong.series-creator-links');
        const names = (el: HtmlElement | undefined) =>
          el
            ?.select('a')
            .map((a) => a.text())
            .join(', ') || undefined;
        const type = document.selectFirst('.series-v72-meta-pair > div:nth-child(2) strong')?.text();
        return {
          url: manga.url,
          title: document.selectFirst('h1')?.text() || manga.title,
          thumbnailUrl: document.selectFirst('.series-v72-cover img')?.absUrl('src') || manga.thumbnailUrl,
          author: names(creators[0]),
          artist: names(creators[1]),
          status: toStatus(document.selectFirst('.series-v72-meta-pair > div:first-child strong')?.text()),
          genres: [
            ...new Set([...(type ? [type] : []), ...document.select("a[href*='/genres/']").map((a) => a.text())]),
          ],
          description: document.selectFirst('.series-seo-context p')?.text(),
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const document = await fetchDocument(`${BASE_URL}${manga.url}`);
        await timers.sleep(0);
        const chapters: Chapter[] = [];
        for (const [i, el] of document.select('.series-v72-chapter-list > a.series-v72-chapter-row').entries()) {
          if (i % 300 === 0) await timers.sleep(0);
          const name = el.selectFirst('.series-chapter-number-text')?.text() ?? '';
          const isVip = el.selectFirst('.chapter-mini-lock') != null;
          chapters.push({
            url: relativeUrl(el.absUrl('href') || el.attr('href') || ''),
            name: isVip ? `🔒 ${name}` : name,
            uploadedAt: Date.parse(el.selectFirst('time')?.attr('datetime') ?? '') || undefined,
          });
        }
        return chapters;
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
        return document
          .select('.reader-pages img')
          .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
      },

      imageHeaders: () => headers,

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?saymanhwa\.com(\/[^/]+\/series\/[^/?#]+)/i.exec(url.trim());
        return match ? { url: match[1]!, title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
