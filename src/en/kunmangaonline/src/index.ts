import { type Chapter, type HtmlElement, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { hostOf } from './madara/MadaraBase';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class KunMangaOnline extends MadaraNoAjax {
  readonly name = 'Kun Manga Online';
  readonly baseUrl = 'https://www.kunmanga.online';

  override archiveSelector(): string {
    return '.c-tabs-item__content, .page-item-detail';
  }
  override archiveUrlSelector = '.post-title a, h3.h4 a';
  override nextPageSelector(): string {
    return 'a[aria-label=Next]';
  }

  // Chapters come from a JSON API, 50 per page.
  override async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = manga.url.split('/').filter(Boolean)[1] ?? '';
    const url = (page: number) => `${this.baseUrl}/api/comics/${slug}/chapters?page=${page}&per_page=50&order=desc`;
    const fetchPage = async (page: number) =>
      (
        await http.get<ChapterListResponse>(url(page), {
          headers: { ...this.headers(), Accept: 'application/json' },
          responseType: 'json',
        })
      ).body.data;
    const first = await fetchPage(1);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, first.last_page - 1) }, (_, i) => fetchPage(i + 2)),
    );
    return [first, ...rest].flatMap((data) =>
      data.chapters.map((c) => {
        const time = c.updated_at ? Date.parse(c.updated_at) : Number.NaN;
        return {
          url: `/manga/${slug}/${c.chapter_slug}`,
          name: c.chapter_name,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      }),
    );
  }

  override imageFromElement(element: HtmlElement | null | undefined): string | null {
    if (!element) return null;
    const host = hostOf(this.baseUrl);
    for (const name of ['data-backup', 'src', 'data-src', 'data-lazy-src', 'data-aload']) {
      const url = element.absUrl(name)?.trim();
      if (url?.startsWith('http') && !url.includes(`${host}/thumb/`)) return url;
    }
    return null;
  }
}

export default defineExtension({
  createSource: () => new KunMangaOnline().toSource(),
});

interface ChapterListResponse {
  data: { chapters: { chapter_name: string; chapter_slug: string; updated_at?: string | null }[]; last_page: number };
}
