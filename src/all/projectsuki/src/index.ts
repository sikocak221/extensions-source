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
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://projectsuki.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const DIVIDER = '/=/-/=/-/=/-/=/-/=/-/=/-/=/-/=/-/=/';

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

/** Browse and search results: `div.browse` cards with a thumbnail link and a title link. */
function parseBooks(document: HtmlElement): MangaSummary[] {
  return document.select('div.browse').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('.details a[href^="/book/"]');
    if (!link) return [];
    const thumb = card.selectFirst('img');
    const src = thumb?.attr('src') ?? '';
    return [
      {
        url: relativeUrl(link.attr('href') ?? ''),
        title: link.text(),
        thumbnailUrl: thumb ? (src.startsWith('http') ? src : `${BASE_URL}${src}`) : undefined,
      },
    ];
  });
}

const option = (label: string, value: string) => ({ label, value });

/** Chapter dates: "Feb 17, 2025" or "3 days ago". */
function chapterDate(text: string): number | undefined {
  const relative = /(\d+)\s+(year|month|week|day|hour|min|minute|sec|second)s?\s+ago/i.exec(text.trim());
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2]!.toLowerCase();
    const ms: Record<string, number> = {
      year: 365 * 86400,
      month: 30 * 86400,
      week: 7 * 86400,
      day: 86400,
      hour: 3600,
      min: 60,
      minute: 60,
      sec: 1,
      second: 1,
    };
    return Date.now() - amount * (ms[unit] ?? 0) * 1000;
  }
  return parseDate(text, 'MMM d, yyyy');
}

export default defineExtension({
  preferences: () => [
    {
      type: 'text',
      key: 'whitelisted_languages',
      label: 'Whitelisted languages',
      description: 'Comma-separated language names (e.g. "english, spanish"). Empty shows every language.',
      default: '',
    },
    {
      type: 'text',
      key: 'blacklisted_languages',
      label: 'Blacklisted languages',
      description: 'Comma-separated language names to hide.',
      default: '',
    },
  ],

  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      const items = parseBooks(await fetchDocument(`${BASE_URL}/browse/${page - 1}`));
      return { items, hasNextPage: items.length >= 30 };
    },

    async getLatest(): Promise<MangaPage> {
      const document = await fetchDocument(BASE_URL);
      const seen = new Set<string>();
      const items = document.select('div.item .details a[href^="/book/"][title]').flatMap((a): MangaSummary[] => {
        const url = relativeUrl(a.attr('href') ?? '');
        if (seen.has(url)) return [];
        seen.add(url);
        const cover = document.selectFirst(`a[href="${url}"] img`);
        return [{ url, title: a.attr('title') ?? a.text(), thumbnailUrl: cover?.absUrl('src') || undefined }];
      });
      return { items, hasNextPage: false };
    },

    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Filters apply to the text search of the whole site' },
        {
          type: 'select',
          id: 'origin',
          label: 'Origin',
          options: [option('Any', ''), option('Japan', 'jp'), option('Korea', 'kr'), option('China', 'cn')],
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: [
            option('Any', ''),
            option('Ongoing', 'Ongoing'),
            option('Completed', 'Completed'),
            option('Hiatus', 'Hiatus'),
            option('Cancelled', 'Cancelled'),
          ],
        },
        { type: 'text', id: 'author', label: 'Author' },
        { type: 'text', id: 'artist', label: 'Artist' },
      ];
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = { page: String(page - 1), q: query };
      const text = (id: string) => (typeof state[id] === 'string' ? (state[id] as string).trim() : '');
      const advanced = ['origin', 'status', 'author', 'artist'].filter((id) => text(id));
      for (const id of advanced) params[id] = text(id);
      if (advanced.length) params.adv = '1';
      const items = parseBooks(await fetchDocument(withQuery(`${BASE_URL}/search`, params)));
      return { items, hasNextPage: items.length >= 30 };
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const rows: Record<string, string> = {};
      const links: Record<string, string[]> = {};
      for (const row of document.select('div.row.py-1')) {
        const label = row.selectFirst('div.strong')?.text().replace(/:$/, '').trim().toLowerCase();
        const value = row.select(':scope > div').filter((d) => !(d.attr('class') ?? '').includes('strong'))[0];
        if (!label || !value) continue;
        rows[label] = value.text().trim();
        links[label] = value.select('a').map((a) => a.text());
      }
      const alerts = document
        .select('.alert, .alert-info')
        .filter((a) => !(a.attr('style') ?? '').includes('display: none'))
        .map((a) => a.text().trim())
        .filter(Boolean);
      const description =
        (document.selectFirst('#descriptionCollapse') ?? document.selectFirst('.description'))?.text().trim() ?? '';
      const details = Object.entries(rows)
        .filter(([label]) => !['user rating', 'purchase'].includes(label))
        .map(([label, value]) => `${label.replace(/^./, (c) => c.toUpperCase())}:  ${value}`);
      const status = (rows.status ?? '').toLowerCase();
      const mapped: MangaStatus =
        status === 'ongoing'
          ? 'ongoing'
          : status === 'completed'
            ? 'completed'
            : status === 'hiatus'
              ? 'hiatus'
              : status === 'cancelled'
                ? 'cancelled'
                : 'unknown';
      const origin = (rows.origin ?? '').toLowerCase();
      const type = /^(kr|korea)/.test(origin)
        ? 'manhwa'
        : /^(cn|china)/.test(origin)
          ? 'manhua'
          : /^(jp|japan)/.test(origin)
            ? 'manga'
            : undefined;
      const thumb = document.selectFirst('img.img-thumbnail');
      return {
        url: manga.url,
        title: document.selectFirst('h2[itemprop=title]')?.text() || document.selectFirst('h2')?.text() || manga.title,
        thumbnailUrl: thumb?.absUrl('src') || manga.thumbnailUrl,
        author: rows.author,
        artist: rows.artist,
        status: mapped,
        type,
        genres: links['genre(s)'] ?? [],
        description:
          [
            alerts.length
              ? `Alerts have been found, refreshing the book later might remove them.\n\n${alerts.join('\n\n')}\n\n${DIVIDER}\n`
              : '',
            description,
            `\n${DIVIDER}\n`,
            details.join('\n'),
          ]
            .filter(Boolean)
            .join('\n') || undefined,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const csv = (key: string) =>
        (prefs.get<string>(key) ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
      const whitelist = csv('whitelisted_languages');
      const blacklist = csv('blacklisted_languages');
      await timers.sleep(0);
      const chapters: Chapter[] = [];
      for (const table of document.select('table')) {
        const rows = table.select('tbody tr');
        const header = table.select('thead tr td').map((td) => td.text().trim().toLowerCase());
        const col = (re: RegExp) => header.findIndex((h) => re.test(h));
        const chapterCol = Math.max(col(/^chapters?$/), 0);
        const langCol = col(/^language$/);
        const groupCol = col(/^groups?$/);
        const dateCol = col(/^(added|date)$/);
        for (const [i, row] of rows.entries()) {
          if (i % 300 === 0) await timers.sleep(0);
          const cells = row.select('td');
          const link = cells[chapterCol]?.selectFirst('a[href]');
          if (!link) continue;
          const language = (langCol >= 0 ? cells[langCol]?.text().trim() : '') || 'unknown';
          if (blacklist.includes(language.toLowerCase())) continue;
          if (whitelist.length && language !== 'unknown' && !whitelist.includes(language.toLowerCase())) continue;
          const name = link.text().replace(/\s+/g, ' ').trim();
          const group = groupCol >= 0 ? (cells[groupCol]?.text().trim() ?? '') : '';
          const match = /(?:chapter|ch\.?)\s*(\d+)(?:\s*[.,-]\s*(\d+))?/i.exec(name);
          chapters.push({
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name,
            number: match ? Number.parseFloat(match[2] ? `${match[1]}.${match[2]}` : match[1]!) : undefined,
            scanlator: `${group} | ${language.charAt(0).toUpperCase()}${language.slice(1)}`,
            uploadedAt: dateCol >= 0 ? chapterDate(cells[dateCol]?.text() ?? '') : undefined,
          });
        }
      }
      return chapters.sort(
        (a, b) => (b.number ?? -1) - (a.number ?? -1) || (a.scanlator ?? '').localeCompare(b.scanlator ?? ''),
      );
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, bookId, chapterId] = chapter.url.split('/').filter(Boolean) as [string, string, string];
      const response = await http.post<{ src: string }>(
        `${BASE_URL}/callpage`,
        { json: { bookid: bookId, chapterid: chapterId, first: 'true' } },
        { headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' }, responseType: 'json' },
      );
      const fragment = html.load(`<div>${response.body.src}</div>`, { baseUrl: BASE_URL });
      const urls = fragment
        .select('img')
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter((u) => /\/images\/gallery\/[^/]+\/[^/]+\/\d+/.test(u));
      if (urls.length === 0) throw new Error("Chapter pages aren't in the expected format");
      const pageNumber = (u: string) => Number.parseInt(/\/(\d+)(?:\?|$)/.exec(u)?.[1] ?? '0', 10);
      return urls.sort((a, b) => pageNumber(a) - pageNumber(b)).map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?projectsuki\.com\/(?:book|read)\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/book/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
