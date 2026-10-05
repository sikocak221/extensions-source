import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './common/utils';
import { relativeDateEs } from './esdate';

const BASE_URL = 'https://lectorhub.j5z.xyz';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CHAPTERS_PER_REQUEST = 30;
// Reader image urls (/api/imagen-capitulo?t=…) only load with the PHP session that rendered the chapter.
let sessionCookie = '';

async function load(url: string): Promise<{ document: HtmlElement; url: string; body: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), {
    headers: sessionCookie ? { ...headers, Cookie: sessionCookie } : headers,
  });
  const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1];
  const session = /PHPSESSID=[^;,\s]+/.exec(setCookie ?? '')?.[0];
  if (session) sessionCookie = session;
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url, body: response.body };
}

/** data-verify: base64 of the reversed image url. */
function decodeVerify(value: string): string | undefined {
  try {
    const url = base64.decode(value).split('').reverse().join('').trim();
    return url.startsWith('http') ? url : undefined;
  } catch {
    return undefined;
  }
}

function statusOf(text: string): MangaStatus {
  if (!text) return 'unknown';
  if (text.includes('complet')) return 'completed';
  if (['pausa', 'hiato'].some((s) => text.includes(s))) return 'hiatus';
  if (['cancel', 'aband'].some((s) => text.includes(s))) return 'cancelled';
  if (['cultivo', 'curso', 'ongoing', 'emision'].some((s) => text.includes(s))) return 'ongoing';
  return 'unknown';
}

async function latest(): Promise<MangaPage> {
  const { document } = await load('/');
  const items = document.select('article.release-card').flatMap((card): MangaSummary[] => {
    const a = card.selectFirst('a.release-title');
    const href = a?.absUrl('href');
    return a && href
      ? [{ url: relativeUrl(href), title: a.text(), thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined }]
      : [];
  });
  return { items, hasNextPage: false };
}

interface ChaptersResponse {
  chapters: { number: string; title: string; published_at?: string | null; is_locked: boolean }[];
  has_more: boolean;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const { document } = await load('/');
      const seen = new Set<string>();
      const items = document.select("a.popular-card[href*='manga.php?id=']").flatMap((a): MangaSummary[] => {
        const url = relativeUrl(a.absUrl('href') ?? '');
        if (seen.has(url)) return [];
        seen.add(url);
        return [
          {
            url,
            title: a.selectFirst('.popular-info strong')?.text() ?? '',
            thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: false };
    },
    getLatest: latest,
    async search(query: string): Promise<MangaPage> {
      if (!query.trim()) return latest();
      const items = (
        await http.get<{ id: number; titulo: string; portada?: string | null }[]>(
          `${BASE_URL}/ajax_search.php?q=${encodeURIComponent(query.trim())}`,
          { headers, responseType: 'json' },
        )
      ).body;
      return {
        items: items
          .filter((item) => item.id !== -1 && item.titulo.trim())
          .map((item) => ({
            url: `/manga.php?id=${item.id}`,
            title: item.titulo,
            thumbnailUrl: item.portada ? absoluteUrl(BASE_URL, item.portada) : undefined,
          })),
        hasNextPage: false,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const blocks = document.select('div.text-gray-200');
      const block = blocks.find((b) => b.select('h3').some((h) => /sinopsis/i.test(h.text()))) ?? blocks[0];
      const description = block ? ownText(block) || block.text().replace(/^SINOPSIS:?\s*/i, '') : undefined;
      return {
        url: manga.url,
        title: document.selectFirst('h1.blood-title')?.text() || manga.title,
        description: description || undefined,
        thumbnailUrl:
          document.selectFirst('div.lg\\:col-span-3 div.cultivation-panel img')?.absUrl('src') || manga.thumbnailUrl,
        genres: document.select("a[href*='directorio.php?genero=']").map((a) => a.text()),
        status: statusOf(document.selectFirst('span.status-badge')?.text().toLowerCase() ?? ''),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      // The manga page renders only the first chapters; the rest come from this endpoint.
      const { body, url } = await load(manga.url);
      const mangaId = /MANGA_ID\s*=\s*(\d+)/.exec(body)?.[1];
      if (!mangaId) throw new Error('MANGA_ID not found');
      const slug =
        url
          .replace(/[?#].*$/, '')
          .replace(/\/$/, '')
          .split('/')
          .pop() ?? '';
      const chapters: Chapter[] = [];
      for (let offset = 0; ;) {
        const result = (
          await http.get<ChaptersResponse>(
            `${BASE_URL}/api_capitulos_manga.php?manga_id=${mangaId}&offset=${offset}&limit=${CHAPTERS_PER_REQUEST}&orden=desc`,
            { headers, responseType: 'json' },
          )
        ).body;
        for (const c of result.chapters) {
          if (c.is_locked) continue;
          chapters.push({
            // Same number format as the chapter links the site renders (two decimals).
            url: `/leer/${slug}/capitulo-${Number(c.number).toFixed(2)}`,
            name: c.title || `Chapter ${c.number}`,
            number: Number(c.number),
            uploadedAt: relativeDateEs(c.published_at) ?? parseDate(c.published_at, 'd MMM, yyyy'),
          });
        }
        offset += result.chapters.length;
        if (!result.has_more || !result.chapters.length) break;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document, url, body } = await load(chapter.url);
      const fromHtml = document
        .select(
          '.page-container img.reader-page-image, .page-container img.protected-img, .reader-body img, .reading-content img',
        )
        .map((img) => {
          const verify = img.attr('data-verify');
          if (verify) return decodeVerify(verify) ?? '';
          return img.absUrl('data-sec-src') || img.absUrl('data-src') || img.absUrl('src') || '';
        })
        .filter(Boolean);
      if (fromHtml.length) return fromHtml.map((imageUrl, index) => ({ index, imageUrl }));
      const path = /\/leer\/([^/]+)\/capitulo-([0-9.]+)/i.exec(url);
      const slug = path?.[1] ?? /MANGA_SLUG\s*=\s*["']([^"']+)["']/.exec(body)?.[1];
      const cap = path?.[2] ?? /CAP_INICIAL\s*=\s*["']([^"']+)["']/.exec(body)?.[1];
      if (!slug || !cap) throw new Error('Could not extract slug/cap for API');
      const payload = (
        await http.get<{ success?: boolean; paginas?: { orden: number; data_verify: string }[] }>(
          `${BASE_URL}/api_lector.php?slug=${encodeURIComponent(slug)}&cap=${encodeURIComponent(cap)}`,
          { headers: { ...headers, Referer: url }, responseType: 'json' },
        )
      ).body;
      if (!payload.success) throw new Error('API returned error');
      const urls = (payload.paginas ?? [])
        .filter((p) => p.data_verify)
        .sort((a, b) => a.orden - b.orden)
        .map((p) => decodeVerify(p.data_verify))
        .filter((u): u is string => Boolean(u));
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    // The image endpoint answers 403 unless the request accepts images.
    imageHeaders: () => ({
      ...headers,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\.php\?id=\d+|\/manga\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
