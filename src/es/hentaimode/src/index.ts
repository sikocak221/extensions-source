import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl } from './common/utils';

const BASE_URL = 'https://hentaimode.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const ADDITIONAL_INFOS = ['Serie', 'Tipo', 'Personajes', 'Idioma'];

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('div.row div[class*="book-list"] > a').flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('.book-description > p')?.text();
    if (!title) return [];
    return [
      {
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        title,
        thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

/** The tags of one info line ("Categorías", "Artista", …): the line's own text names it. */
function getInfo(info: HtmlElement, label: string): string | undefined {
  const row = info.select('div.tag-container').find(
    (container) =>
      container
        .html()
        .replace(/<[^>]+>[\s\S]*$/, '')
        .includes(label) || container.text().trim().startsWith(label),
  );
  const tags = row?.select('a.tag').map((a) => a.text()) ?? [];
  return tags.length ? tags.join(', ') : undefined;
}

function parseDetails(document: HtmlElement, url: string): MangaDetails {
  const info = document.selectFirst('div#info-block > div#info');
  if (!info) throw new Error('Manga info not found');
  const description = ADDITIONAL_INFOS.flatMap((label) => {
    const value = getInfo(info, label);
    return value ? [`${label}: ${value}\n`] : [];
  }).join('');
  return {
    url,
    title: info.selectFirst('h1')?.text() ?? '',
    thumbnailUrl: document.selectFirst('div#cover img')?.absUrl('src') || undefined,
    status: 'completed',
    genres: getInfo(info, 'Categorías')?.split(', '),
    author: getInfo(info, 'Grupo'),
    artist: getInfo(info, 'Artista'),
    description: description || undefined,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return parseMangaList((await load(BASE_URL)).document);
    },
    async search(query): Promise<MangaPage> {
      if (query.length < 3) throw new Error('Please use at least 3 characters!');
      return parseMangaList((await load(`${BASE_URL}/buscar?s=${encodeURIComponent(query)}`)).document);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return parseDetails((await load(`${BASE_URL}${manga.url}`)).document, manga.url);
    },
    // A gallery is one chapter.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return [{ url: manga.url.replace('/g/', '/leer/'), name: 'Chapter', number: 1 }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(`${BASE_URL}${chapter.url}`);
      const script = document
        .select('script')
        .map((s) => s.html())
        .find((text) => text.includes('page_image'));
      if (!script) throw new Error('Pages not found');
      const paths = (script.split('pages = [')[1] ?? '')
        .split(',]')[0]!
        .split(']')[0]!
        .split(',')
        .map((item) => (item.split(':').slice(1).join(':').split('"')[1] ?? '').trim());
      return paths.filter(Boolean).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const id = /^https?:\/\/(?:www\.)?hentaimode\.com\/(?:g|leer)\/([^/?#]+)/i.exec(url)?.[1];
      return id ? { url: `/g/${id}`, title: '' } : null;
    },
  }),
});
