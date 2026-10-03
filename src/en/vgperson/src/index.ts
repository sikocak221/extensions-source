import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, htmlToText } from './common/utils';

const BASE_URL = 'https://vgperson.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const COVERS: Record<string, string> = {
  "The Festive Monster's Cheerful Failure": 'kEK10GL.png',
  'Azure and Claude': 'buXnlmh.jpg',
  'Three Days of Happiness': 'kL5dvnp.jpg',
};
const cover = (title: string) => (COVERS[title] ? `https://i.imgur.com/${COVERS[title]}` : undefined);

// Manga and chapter urls are viewer urls ("/other/mangaviewer.php?m=...&c=...").
const PATH = '/other/mangaviewer.php';

async function load(url: string) {
  const response = await http.get(`${BASE_URL}${url}`, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function catalogue(): Promise<MangaSummary[]> {
  return (await load(PATH))
    .select('.content a[href^="?m"]')
    .map((a) => ({ url: `${PATH}${a.attr('href') ?? ''}`, title: a.text(), thumbnailUrl: cover(a.text()) }));
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (): Promise<MangaPage> => ({ items: await catalogue(), hasNextPage: false }),
    search: async (query): Promise<MangaPage> => ({
      items: (await catalogue()).filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase())),
      hasNextPage: false,
    }),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const title = document.selectFirst('.title')?.text() || manga.title;
      const complete = document
        .select('div.content .complete')
        .map((e) => e.text())
        .join(' ');
      // The description runs from after the header lines to the chapter table.
      const content = (document.selectFirst('.content')?.html() ?? '').split(/<table/i)[0] ?? '';
      const description = htmlToText(content.replace(/^[\s\S]*?class="complete"[^>]*>[^<]*<\/[^>]+>/, '')).trim();
      return {
        url: manga.url,
        title,
        thumbnailUrl: cover(title),
        status: complete === '(Complete)' ? 'completed' : complete === '(Series in Progress)' ? 'ongoing' : 'unknown',
        description: description || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document
        .select('.chaptertable tbody tr')
        .flatMap((row): Chapter[] => {
          const link = row.selectFirst('td > a');
          if (!link) return [];
          const href = link.attr('href') ?? '';
          const cells = row.select('td');
          const extra =
            cells.length > 1
              ? cells[cells.length - 1]!.text().split('- ').slice(1).join('- ') || cells[cells.length - 1]!.text()
              : '';
          const c = /[?&]c=([\d.]+)/.exec(href)?.[1];
          const b = /[?&]b=([\d.]+)/.exec(href)?.[1];
          return [
            {
              url: `${PATH}${href}`,
              name: extra ? `${link.text()} - ${extra}` : link.text(),
              number: c ? Number(c) : b ? 16.5 + Number(b) / 10 : undefined,
              scanlator: 'vgperson',
            },
          ];
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const m = /^https?:\/\/(?:www\.)?vgperson\.com\/other\/mangaviewer\.php\?(?:.*&)?m=([^&#]+)/i.exec(url.trim());
      return m ? { url: `${PATH}?m=${m[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
