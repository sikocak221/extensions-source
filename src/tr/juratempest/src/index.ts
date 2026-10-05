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

const BASE_URL = 'https://juratempe.st';
const SEARCH_PAGE_SIZE = 20;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// Chapters of the series page are hydrated in its script data.
const CHAPTER_ENTRY =
  /slug:"([^"]+)",number:([0-9.]+),title:"((?:[^"\\]|\\.)*)",isSpecial:(!0|!1),createdAt:(?:\$\w+\[\d+\]=)?new Date\("([^"]+)"\)/g;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const empty: MangaPage = { items: [], hasNextPage: false };

const normalizeForSearch = (text: string) =>
  text
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/[^a-z0-9]+/g, '');

function parseStatus(text: string): MangaStatus {
  const value = text.toLowerCase();
  if (value.includes('devam')) return 'ongoing';
  if (value.includes('tamamlandı')) return 'completed';
  if (value.includes('ara verildi')) return 'hiatus';
  if (value.includes('iptal') || value.includes('bırakıldı')) return 'cancelled';
  return 'unknown';
}

function hydratedChapters(body: string, mangaUrl: string): Chapter[] {
  return [...body.matchAll(CHAPTER_ENTRY)].map((match) => {
    const [, slug, number, title, isSpecial, createdAt] = match;
    return {
      url: `${mangaUrl}/${slug}`,
      name: title!.replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
      number: Number(number) || undefined,
      uploadedAt: Date.parse(createdAt!) || undefined,
      scanlator: isSpecial === '!0' ? 'Özel' : undefined,
    };
  });
}

// Older chapters are not listed on the page: probe the chapter pages below the lowest listed one.
async function fillMissingChapters(mangaUrl: string, visible: Chapter[]): Promise<Chapter[]> {
  const wholes = visible.map((c) => c.number ?? -1).filter((n) => n > 0 && Number.isInteger(n));
  if (wholes.length === 0) return [];
  const lowestWhole = Math.min(...wholes);
  if (lowestWhole <= 1) return [];
  const discovered = new Map<number, Chapter>();
  const probe = async (n: number): Promise<boolean> => {
    try {
      const response = await http.get(`${BASE_URL}${mangaUrl}/${n}`, { headers });
      for (const chapter of hydratedChapters(response.body, mangaUrl)) {
        if (chapter.number && chapter.number > 0 && Number.isInteger(chapter.number))
          discovered.set(chapter.number, chapter);
      }
      return true;
    } catch {
      return false;
    }
  };
  let lastGood = lowestWhole;
  let probeNumber = lowestWhole - 1;
  let failedAt: number | undefined;
  while (probeNumber >= 1) {
    if (await probe(probeNumber)) {
      lastGood = probeNumber;
      if (probeNumber === 1) break;
      probeNumber = Math.max(1, probeNumber - 10);
    } else {
      failedAt = probeNumber;
      break;
    }
  }
  let lowerBound = 1;
  if (failedAt !== undefined) {
    let lo = failedAt + 1;
    let hi = lastGood;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (await probe(mid)) hi = mid;
      else lo = mid + 1;
    }
    lowerBound = lo;
  }
  if (lowerBound >= lowestWhole) return [];
  const chapters: Chapter[] = [];
  for (let n = lowestWhole - 1; n >= lowerBound; n--) {
    chapters.push(discovered.get(n) ?? { url: `${mangaUrl}/${n}`, name: `Bölüm ${n}`, number: n });
  }
  return chapters;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      if (page > 1) return empty;
      const document = await load('/');
      const items = document.select('div.swiper-slide').flatMap((slide): MangaSummary[] => {
        const link = slide.selectFirst('a[href^=/explore/]');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: link.text(),
            thumbnailUrl: slide.selectFirst('div[class*="aspect-2/3"] img')?.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      if (page > 1) return empty;
      const document = await load('/');
      const section = document
        .select('section')
        .find((s) => s.select('h2').some((h2) => ownText(h2).includes('Son Yüklenenler')));
      if (!section) return empty;
      const seen = new Set<string>();
      const items = section.select('a[href^=/explore/]').flatMap((element): MangaSummary[] => {
        const slug = (element.attr('href') ?? '').replace('/explore/', '').split('/')[0];
        const title = element.selectFirst('span.truncate.font-semibold')?.text();
        if (!slug || !title || seen.has(slug)) return [];
        seen.add(slug);
        return [
          { url: `/explore/${slug}`, title, thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined },
        ];
      });
      return { items, hasNextPage: false };
    },
    async search(query, page): Promise<MangaPage> {
      if (!query.trim()) return empty;
      const sitemap = (await http.get(`${BASE_URL}/sitemap.xml`, { headers })).body;
      const slugs = [
        ...new Set(
          [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].flatMap((m) => {
            const match = /^https?:\/\/([^/]+)\/explore\/([^/?#]+)\/?$/.exec(m[1]!);
            return match && match[1] === hostOf(BASE_URL) ? [match[2]!] : [];
          }),
        ),
      ];
      const needle = normalizeForSearch(query);
      const matched = slugs.filter((slug) => normalizeForSearch(slug).includes(needle));
      const items: MangaSummary[] = [];
      for (const slug of matched.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE)) {
        const document = await load(`/explore/${slug}`);
        items.push({
          url: `/explore/${slug}`,
          title: document.selectFirst('h1')?.text() || slug,
          thumbnailUrl: document.selectFirst('div[data-slot=manga-detail-hero-cover] img')?.absUrl('src') || undefined,
        });
      }
      return { items, hasNextPage: matched.length > page * SEARCH_PAGE_SIZE };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const genres = document
        .select('div[data-slot=manga-detail-tags-genres] span[data-slot=badge]')
        .map((span) => span.text());
      const statusText = document
        .selectFirst('div[data-slot=manga-detail-metadata] span:has(svg.lucide-clock)')
        ?.text();
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl:
          document.selectFirst('div[data-slot=manga-detail-hero-cover] img')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('p[data-slot=manga-detail-hero-description]')?.text() || undefined,
        genres: genres.length ? genres : undefined,
        status: statusText ? parseStatus(statusText) : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const hydrated = hydratedChapters(response.body, manga.url);
      if (hydrated.length > 0) return hydrated;
      const document = html.load(response.body, { baseUrl: response.url });
      const visible = document.select('a[data-slot=chapter-row]').flatMap((element): Chapter[] => {
        const name = element.selectFirst('span.truncate.font-medium')?.text();
        if (!name) return [];
        const number = Number.parseFloat(element.selectFirst('div.size-10')?.text().trim() ?? '');
        // Dates look like "12 Eki 2025" (Istanbul time).
        const date = parseDate(element.selectFirst('span.text-muted-foreground.text-xs')?.text(), 'd MMM yyyy');
        return [
          {
            url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
            name,
            number: Number.isNaN(number) ? undefined : number,
            uploadedAt: date === undefined ? undefined : date - 3 * 3_600_000,
          },
        ];
      });
      return [...visible, ...(await fillMissingChapters(manga.url, visible))];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('div[data-slot=reader-images] img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/explore\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/explore/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
