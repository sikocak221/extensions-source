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
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, imgAttr, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://mangablackcat.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const THAI_MONTHS: [string, string][] = [
  ['มกราคม', 'January'],
  ['กุมภาพันธ์', 'February'],
  ['มีนาคม', 'March'],
  ['เมษายน', 'April'],
  ['พฤษภาคม', 'May'],
  ['มิถุนายน', 'June'],
  ['กรกฎาคม', 'July'],
  ['สิงหาคม', 'August'],
  ['กันยายน', 'September'],
  ['ตุลาคม', 'October'],
  ['พฤศจิกายน', 'November'],
  ['ธันวาคม', 'December'],
];

const BOOT_JSON = /boot:\s*JSON\.parse\('((?:\\'|[^'])*)'\)/g;

async function load(url: string, referer?: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), {
    headers: referer ? { ...headers, Referer: referer } : headers,
  });
  return html.load(response.body, { baseUrl: response.url });
}

function toSummary(element: HtmlElement): MangaSummary[] {
  const link = element.selectFirst('a[href*="/manga/"]');
  if (!link) return [];
  const image = element.selectFirst('img');
  const title = image?.attr('alt')?.trim() || element.selectFirst('h3')?.text() || link.attr('title') || '';
  return [
    {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      title: title.trim(),
      thumbnailUrl: imgAttr(image) || undefined,
    },
  ];
}

function parseMangaList(document: HtmlElement): MangaPage {
  return {
    items: document.select('article.manga-card').flatMap(toSummary),
    hasNextPage: document.selectFirst('a[rel=next], a[aria-label*=Next]') != null,
  };
}

function parseStatus(text: string | undefined): MangaStatus {
  const status = text?.toLowerCase() ?? '';
  if (status.includes('กำลังอัพเดท') || status.includes('ongoing')) return 'ongoing';
  if (status.includes('จบแล้ว') || status.includes('completed')) return 'completed';
  return 'unknown';
}

// e.g. "45m ago", "13h ago", "2d ago", "3w ago", "6mos ago", "1y ago"
function parseRelativeDate(date: string): number | undefined {
  const match = /(\d+)\s*([a-z]+)\s+ago/.exec(date.toLowerCase());
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]!;
  const now = new Date();
  if (/^s(ec|ecs|econd|econds)?$/.test(unit)) return now.getTime() - amount * 1000;
  if (/^m(in|ins|inute|inutes)?$/.test(unit)) return now.getTime() - amount * 60_000;
  if (/^h(r|rs|our|ours)?$/.test(unit)) return now.getTime() - amount * 3_600_000;
  if (/^d(ay|ays)?$/.test(unit)) return now.getTime() - amount * 86_400_000;
  if (/^w(k|ks|eek|eeks)?$/.test(unit)) return now.getTime() - amount * 7 * 86_400_000;
  if (/^mo(s|nth|nths)?$/.test(unit)) now.setMonth(now.getMonth() - amount);
  else if (/^y(r|rs|ear|ears)?$/.test(unit)) now.setFullYear(now.getFullYear() - amount);
  else return undefined;
  return now.getTime();
}

function parseChapterDate(text: string | undefined): number | undefined {
  const date = text?.trim();
  if (!date) return undefined;
  if (/ago/i.test(date)) return parseRelativeDate(date);
  const english = THAI_MONTHS.reduce((value, [thai, en]) => value.replace(thai, en), date);
  const time = parseDate(english, 'MMMM d, yyyy');
  return time === undefined ? undefined : time - 7 * 3_600_000; // Asia/Bangkok
}

function parseChapters(document: HtmlElement, location: string): Chapter[] {
  const slugPath = /\/manga\/([^/?#]+)/.exec(location)?.[1] ?? '';
  const cards = document.select('a.chapter-card-link[data-chapter-number]');
  if (cards.length > 0) {
    return cards.map((card): Chapter => {
      const url = relativeUrl(card.absUrl('href') || card.attr('href') || '');
      const number = Number.parseFloat(card.attr('data-chapter-number') ?? '');
      return {
        url,
        name: card.selectFirst('h4')?.text() || `ตอนที่ ${Number.isNaN(number) ? '' : String(number)}`,
        number: Number.isNaN(number) ? Number.parseFloat(url.replace(/\/$/, '').split('/').pop() ?? '') || -1 : number,
        uploadedAt: parseChapterDate(card.selectFirst('p')?.text()),
      };
    });
  }
  // The fallback also matches the "first/latest chapter" buttons, so only use it when there are no chapter cards.
  if (!slugPath) return [];
  const chapterUrl = new RegExp(`/manga/${slugPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d+(?:\\.\\d+)?)/*$`);
  return document.select('a[href*="/manga/"]').flatMap((link): Chapter[] => {
    const href = link.absUrl('href') || link.attr('href') || '';
    const number = Number.parseFloat(chapterUrl.exec(href.split('?')[0]!)?.[1] ?? '');
    if (Number.isNaN(number)) return [];
    const text = link.text();
    if (!text.includes('ตอน') && !text.includes(String(number))) return [];
    return [{ url: relativeUrl(href), name: text || `ตอนที่ ${number}`, number }];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaList(await load(`/manga?sort=popular&page=${page}`)),
    getLatest: async (page) => parseMangaList(await load(`/latest?page=${page}`)),
    search: async (query, page) => parseMangaList(await load(`/search?q=${encodeURIComponent(query)}&page=${page}`)),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const scope = 'article, main';
      const status = document
        .select(`${scope.split(', ').join(' span, ')} span`)
        .map((e) => e.text())
        .find((text) => text.includes('กำลังอัพเดท') || text.includes('จบแล้ว'));
      const description = document
        .select('article [class*=leading-relaxed], main [class*=leading-relaxed]')
        .map((e) => e.text())
        .find((text) => text.length > 80);
      return {
        url: manga.url,
        title: document.selectFirst('article h1, main h1')?.text() || manga.title,
        thumbnailUrl: imgAttr(document.selectFirst('article figure img, main figure img')) || manga.thumbnailUrl,
        author:
          document.selectFirst('article span span.text-base-content, main span span.text-base-content')?.text() ||
          undefined,
        status: parseStatus(status),
        description: description || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const first = absoluteUrl(BASE_URL, manga.url);
      const requested = new Set([first]);
      const chapters: Chapter[] = [];
      let document = await load(first);
      let location = first;
      for (;;) {
        chapters.push(...parseChapters(document, location));
        const next = document.selectFirst("nav[aria-label='Pagination Navigation'] a[rel=next]")?.absUrl('href');
        if (!next || requested.has(next)) break;
        requested.add(next);
        document = await load(next, location);
        location = next;
      }
      const seen = new Set<string>();
      return chapters
        .filter((c) => !seen.has(c.url) && seen.add(c.url))
        .sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const images = [...document.html().matchAll(BOOT_JSON)].flatMap((match): string[] => {
        const decoded = decodeEntities(match[1]!)
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
          .replace(/\\\//g, '/')
          .replace(/\\'/g, "'")
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\');
        try {
          const image = (JSON.parse(decoded) as { image?: string }).image;
          return image ? [image] : [];
        } catch {
          return [];
        }
      });
      const unique = [...new Set(images)];
      if (unique.length > 0) return unique.map((imageUrl, index) => ({ index, imageUrl }));
      return [
        ...new Set(
          document
            .select('main img[src], .reader-protected img[src]')
            .map((img) => imgAttr(img))
            .filter((url) => url && !url.includes('/storage/chapter-thumbnails/')),
        ),
      ].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' }),
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
