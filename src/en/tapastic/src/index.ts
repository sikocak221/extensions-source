import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://tapas.io';
const API_URL = 'https://story-api.tapas.io';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:105.0) Gecko/20100101 Firefox/105.0';
const headers = {
  'User-Agent': USER_AGENT,
  Referer: 'https://m.tapas.io',
  Cookie: 'birthDate=1990-01-01; adjustedBirthDate=1990-01-01',
};

const LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'lockedChapterVisibilityPref',
  label: 'Show paywalled chapters (Tapas requires login or payment for some)',
  default: true,
};

const SCHEDULED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'scheduledChapterVisibilityPref',
  label: 'Show scheduled chapters',
  default: true,
};

interface MangaDto {
  seriesId: number;
  title: string;
  description?: string;
  assetProperty?: { bookCoverImage?: Record<string, string> };
}

interface ChapterDto {
  id: number;
  title: string;
  publish_date: string;
  unlocked: boolean;
  free: boolean;
  scene: number;
  scheduled: boolean;
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const toSummary = (m: MangaDto): MangaSummary => {
  const cover = Object.values(m.assetProperty?.bookCoverImage ?? {})[0];
  return { url: `/series/${m.seriesId}`, title: m.title, thumbnailUrl: cover ? `${cover}.png` : undefined };
};

async function landing(path: string): Promise<MangaPage> {
  const response = await http.get(`${API_URL}${path}`, { headers });
  const dto = JSON.parse(response.body) as { data: { items: MangaDto[] }; meta?: { pagination?: { last?: boolean } } };
  return { items: dto.data.items.map(toSummary), hasNextPage: !(dto.meta?.pagination?.last ?? true) };
}

export default defineExtension({
  preferences: () => [LOCKED_PREFERENCE, SCHEDULED_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) =>
      landing(`/cosmos/api/v1/landing/ranking?category_type=COMIC&subtab_id=17&size=25&page=${page - 1}`),
    getLatest: (page) =>
      landing(
        `/cosmos/api/v1/landing/genre?category_type=COMIC&sort_option=NEWEST_EPISODE&subtab_id=17&pageSize=25&page=${page - 1}`,
      ),
    async search(query: string, page: number): Promise<MangaPage> {
      const document = await load(`/search?pageNumber=${page}&q=${encodeURIComponent(query.trim())}&t=COMICS`);
      const items = document.select('.search-item-wrap').flatMap((el): MangaSummary[] => {
        const id = el.selectFirst('.item__thumb a, .title-section .title a')?.attr('data-series-id');
        if (!id) return [];
        return [
          {
            url: `/series/${id}`,
            title:
              el.selectFirst('.item__thumb img')?.attr('alt') ||
              el
                .select('.title-section .title a')
                .map((a) => a.text())
                .join(' '),
            thumbnailUrl: el.selectFirst('.item__thumb img, .thumb-wrap img')?.attr('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: document.selectFirst('a[class*=paging__button--next]') != null };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${manga.url}/info`);
      const title = document.selectFirst('.info__right .title')?.text() || manga.title;
      const type = document.selectFirst('.stats > a[href^="/static-landing/genre?category="]')?.text();
      const colophon = document.selectFirst('.colophon')?.text().trim();
      const schedule =
        document.selectFirst('.schedule-ico:has(.sp-ico-updated-line-pwt) + .schedule-label')?.text() ?? '';
      return {
        url: manga.url,
        title,
        thumbnailUrl: document.selectFirst('.thumb.js-thumbnail img')?.absUrl('src') || manga.thumbnailUrl,
        description:
          [
            document.selectFirst('.description__body')?.text(),
            type ? `Type: ${type}` : '',
            colophon
              ? colophon.replace(
                  new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\((?:Novel|Comic)\\))?\\s*`, 'i'),
                  '',
                )
              : '',
          ]
            .filter(Boolean)
            .join('\n\n') || undefined,
        genres: [...new Set(document.select('.genre-btn').map((g) => g.text()))],
        author:
          document
            .select('.creator-section .name')
            .map((n) => n.text())
            .join(', ') || undefined,
        status: /updates/i.test(schedule) ? 'ongoing' : /completed/i.test(schedule) ? 'completed' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const showLocked = prefs.get<boolean>(LOCKED_PREFERENCE.key) ?? true;
      const showScheduled = prefs.get<boolean>(SCHEDULED_PREFERENCE.key) ?? true;
      const chapters: Chapter[] = [];
      for (let page = 1, more = true; more; page++) {
        const response = await http.get(
          `${BASE_URL}${manga.url}/episodes?page=${page}&sort=NEWEST&large=true&last_access=0`,
          { headers },
        );
        const dto = JSON.parse(response.body) as {
          data: { pagination: { has_next?: boolean }; episodes: ChapterDto[] };
        };
        for (const e of dto.data.episodes) {
          const open = e.unlocked || e.free;
          if (!(showLocked || open) || !(showScheduled || !e.scheduled)) continue;
          const date = Date.parse(e.publish_date);
          chapters.push({
            url: `/episode/${e.id}`,
            name: open ? e.title : `🔒 ${e.title}`,
            number: e.scene,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          });
        }
        more = dto.data.pagination.has_next === true;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      // The "Style" button only exists in the novel reader, locked chapters included.
      if (document.selectFirst('.toolbar a[data-type="style"]'))
        throw new Error('This is not a comic, but a novel chapter');
      const pages = document
        .select('img.content__img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.absUrl('src') || '' }));
      if (pages.length === 0) throw new Error('Chapter locked');
      return pages;
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.startsWith('/series/') ? `${item.url}/info` : item.url),
  }),
});
