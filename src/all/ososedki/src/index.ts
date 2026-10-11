import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, withQuery } from './common/utils';

const BASE_URL = 'https://ososedki.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const ALBUM_ID = /^-?\d+_\d+$/;

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const imgSrc = (img: HtmlElement | null | undefined) =>
  img?.attr('data-src') ? img.absUrl('data-src') : img?.attr('src') ? img.absUrl('src') : undefined;

async function getAlbums(page: number, type?: string, value?: string): Promise<MangaPage> {
  const params: Record<string, string> = { page: String(page) };
  if (type && value) {
    params.type = type;
    params.value = value;
  }
  const data = (
    await http.get<{ html: string; hasMore?: boolean }>(withQuery(`${BASE_URL}/api/albums`, params), {
      headers,
      responseType: 'json',
    })
  ).body;
  const document = html.load(`<div>${data.html}</div>`, { baseUrl: BASE_URL });
  const items = document.select('article.gallery-item:has(a.gallery-link)').flatMap((el): MangaSummary[] => {
    const href = el.selectFirst('a.gallery-link')?.absUrl('href') ?? '';
    const albumId = /\/photos\/(-?\d+_\d+)/.exec(href)?.[1];
    if (!albumId) return [];
    const title =
      el.selectFirst('h3')?.text().trim() || el.selectFirst('img.gallery-img')?.attr('alt')?.split(' nude.')[0]?.trim();
    if (!title) return [];
    return [{ url: `/photos/${albumId}`, title, thumbnailUrl: imgSrc(el.selectFirst('img.gallery-img')) }];
  });
  return { items, hasNextPage: data.hasMore === true };
}

const idOf = (url: string) => url.split('/').pop()!;
const photoUrl = (url: string) => `${BASE_URL}/photos/${idOf(url)}`;

const tags = (document: HtmlElement, selector: string) => [
  ...new Set(
    document
      .select(selector)
      .map((a) => a.text().trim())
      .filter(Boolean),
  ),
];

async function loadAlbum(albumId: string): Promise<{ document: HtmlElement; details: MangaDetails }> {
  const document = await fetchDocument(photoUrl(albumId));
  const models = tags(document, 'a[href^="/model/"]');
  const cosplay = tags(document, 'a[href^="/cosplay/"]');
  const fandom = tags(document, 'a[href^="/fandom/"]');
  const title =
    [models[0], cosplay[0], fandom[0]].filter(Boolean).join(' - ') ||
    (document.selectFirst('h1')?.text().trim() ?? '')
      .replace(/\s*\(\d+\s+leaked\s+photos\)\s+from\s+Onlyfans,\s+Patreon\s+and\s+Fansly\s*$/i, '')
      .trim();
  if (!title) throw new Error(`Title is missing for album id: ${albumId}`);
  const parts = /^(-?\d+)_(\d+)$/.exec(albumId);
  const cover = parts ? `${BASE_URL}/images/albums/${parts[1]}/${parts[2]}.webp` : undefined;
  return {
    document,
    details: {
      url: albumId,
      title,
      thumbnailUrl:
        cover ??
        imgSrc(document.selectFirst('img.gallery-img')) ??
        document.selectFirst('meta[property=og:image]')?.attr('content'),
      author: models.join(', ') || undefined,
      artist: cosplay.join(', ') || undefined,
      genres: [...new Set([...models, ...cosplay, ...fandom])],
      status: 'completed',
    },
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page: number) => getAlbums(page, 'top', '1'),

    getLatest: (page: number) => getAlbums(page),

    async search(query: string, page: number): Promise<MangaPage> {
      const q = query.trim();
      return q ? getAlbums(page, 'search', q) : getAlbums(page, 'top', '1');
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return { ...(await loadAlbum(idOf(manga.url))).details, url: manga.url };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await loadAlbum(idOf(manga.url));
      const ld = document
        .select('script[type=application/ld+json]')
        .map((s) => s.html())
        .find((s) => s.includes('"datePublished"'));
      const date = ld ? /"datePublished":"([^"]+)"/.exec(ld)?.[1] : undefined;
      return [{ url: manga.url, name: 'Gallery', number: 0, uploadedAt: Date.parse(date ?? '') || undefined }];
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(photoUrl(chapter.url));
      const urls = [
        ...new Set(
          document
            .select(`#photos a[href^="/images/"], #photos a[href^="https://ososedki.com/images/"]`)
            .map((a) => a.absUrl('href') ?? '')
            .filter(Boolean),
        ),
      ];
      const number = (u: string) => Number.parseInt(u.split('/').pop()!.split('.')[0]!, 10);
      urls.sort((a, b) => (Number.isNaN(number(a)) ? 1e9 : number(a)) - (Number.isNaN(number(b)) ? 1e9 : number(b)));
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?ososedki\.com\/photos\/(-?\d+_\d+)/i.exec(url.trim());
      return match && ALBUM_ID.test(match[1]!) ? { url: `/photos/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => photoUrl(item.url),
  }),
});
