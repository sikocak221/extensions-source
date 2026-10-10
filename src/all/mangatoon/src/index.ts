import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://mangatoon.mobi';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const ONGOING = [
  '连载', 'on going', 'sedang berlangsung', 'tiếp tục cập nhật', 'en proceso', 'atualizando', 'เซเรียล', 'en cours', '連載中',
]; // prettier-ignore
const COMPLETED = ['完结', 'completed', 'tamat', 'đã full', 'terminada', 'concluído', 'จบ', 'fin'];

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const imgAttr = (element: HtmlElement | null | undefined) =>
  element?.attr('data-src') ? (element.absUrl('data-src') ?? '') : (element?.absUrl('src') ?? '');

const toNormalPosterUrl = (url: string) => url.replace(/(jpg)-poster(.*)\d+?$/, '$1');

function toStatus(text: string, lang: string): MangaStatus {
  const value = text.toLowerCase();
  if (ONGOING.includes(value)) return 'ongoing';
  if (COMPLETED.includes(value)) return 'completed';
  void lang;
  return 'unknown';
}

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const lang = info.lang;
    const urlLang = lang === 'zh' ? 'cn' : lang === 'pt-BR' ? 'pt' : lang;
    const lockedError =
      lang === 'pt-BR'
        ? 'Este capítulo é pago e não pode ser lido. Use o app oficial do MangaToon para comprar e ler.'
        : "This chapter is paid and can't be read. Use the MangaToon official app to purchase and read it.";

    const mangaListParse = (document: HtmlElement): MangaPage => ({
      items: document.select('div.genre-content div.items a').map((el) => ({
        url: relativeUrl(el.absUrl('href') || el.attr('href') || ''),
        title: el
          .select('div.content-title')
          .map((t) => t.text())
          .join(' '),
        thumbnailUrl: toNormalPosterUrl(imgAttr(el.selectFirst('img'))) || undefined,
      })),
      hasNextPage: document.selectFirst('span.next') != null,
    });

    return {
      baseUrl: BASE_URL,

      async getPopular(page: number): Promise<MangaPage> {
        // Portuguese website doesn't seem to have popular titles.
        const path = lang === 'pt-BR' ? 'comic' : 'hot';
        return mangaListParse(await fetchDocument(`${BASE_URL}/${urlLang}/genre/${path}?type=1&page=${page - 1}`));
      },

      async getLatest(page: number): Promise<MangaPage> {
        return mangaListParse(await fetchDocument(`${BASE_URL}/${urlLang}/genre/new?type=1&page=${page - 1}`));
      },

      async search(query: string): Promise<MangaPage> {
        const document = await fetchDocument(withQuery(`${BASE_URL}/${urlLang}/search`, { word: query }));
        const items = document
          .select('div.comics-result div.recommend-item')
          .filter((el) => (el.selectFirst('a')?.absUrl('href') ?? '').startsWith(BASE_URL))
          .map((el) => ({
            url: relativeUrl(el.selectFirst('a')?.absUrl('href') ?? ''),
            title: el
              .select('div.recommend-comics-title')
              .map((t) => t.text())
              .join(' '),
            thumbnailUrl: toNormalPosterUrl(imgAttr(el.selectFirst('img'))) || undefined,
          }));
        return { items, hasNextPage: document.selectFirst('span.next') != null };
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const document = await fetchDocument(`${BASE_URL}${manga.url}`);
        const thumbnail = toNormalPosterUrl(imgAttr(document.selectFirst('div.detail-img img')));
        const genres = (
          document
            .select('div.detail-tags-info span')
            .map((s) => s.text())
            .join(' ') || ''
        )
          .split('/')
          .map((g) => g.trim())
          .filter(Boolean)
          .map((g) => g.charAt(0).toUpperCase() + g.slice(1))
          .sort();
        return {
          url: manga.url,
          title: manga.title,
          author:
            document
              .select('div.detail-author-name span')
              .map((s) => s.text())
              .join(' ')
              .split(': ')
              .slice(1)
              .join(': ') || undefined,
          description:
            document
              .select('div.detail-description-short p')
              .map((p) => p.text())
              .join('\n\n') || undefined,
          genres,
          status: toStatus(
            document
              .select('div.detail-status')
              .map((s) => s.text())
              .join(' '),
            lang,
          ),
          thumbnailUrl: thumbnail && !thumbnail.includes('cartoon-big-images') ? thumbnail : manga.thumbnailUrl,
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const document = await fetchDocument(`${BASE_URL}${manga.url}`);
        // The page only renders a few episodes; the full list (with paid flags) is embedded as JSON.
        const watchPath = document
          .selectFirst('a.episode-item-new')
          ?.attr('href')
          ?.replace(/\/[^/]*$/, '');
        if (!watchPath) return [];
        let episodes: { id: number; title: string; weight: number; open_at?: string; is_fee?: boolean }[] = [];
        for (const script of document.select('script')) {
          const match = /data = JSON\.parse\('(.*)'\);/.exec(script.html());
          if (match) {
            episodes = JSON.parse(match[1]!.replace(/\\(["'])/g, '$1')) as typeof episodes;
            break;
          }
        }
        // Episodes come oldest first; Matane wants newest first.
        return episodes
          .filter((e) => !e.is_fee)
          .map((e) => ({
            url: `${relativeUrl(watchPath)}/${e.id}`,
            name: e.title,
            number: e.weight,
            uploadedAt: parseDate(e.open_at, 'yyyy-MM-dd'),
          }))
          .reverse();
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
        const pages = document
          .select('div.pictures div img:first-child')
          .map((img, index) => ({ index, imageUrl: imgAttr(img) }));
        if (pages.length === 0) throw new Error(lockedError);
        return pages;
      },

      imageHeaders: () => headers,

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?mangatoon\.mobi(\/[a-z-]+\/[^#\s]+)/i.exec(url.trim());
        return match ? { url: match[1]!, title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
