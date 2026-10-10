import { type MangaPage, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class ShonenJump extends GigaViewer {
  readonly name = 'Shonen Jump+';
  readonly baseUrl = 'https://shonenjumpplus.com';

  override filterOptions(): [string, string[]][] {
    return [
      ['ジャンプ＋連載一覧', ['']],
      ['ジャンプ＋読切シリーズ', ['/oneshot']],
      ['連載終了作品', ['/finished']],
    ];
  }

  override async getPopular(): Promise<MangaPage> {
    return { items: await this.fetchSeriesPage('', 'ul.series-list li a'), hasNextPage: false };
  }

  override async getLatest(): Promise<MangaPage> {
    const day = new Date(Date.now() + 9 * 3_600_000).getUTCDay();
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day]!;
    const items = await this.fetchSeriesPage('', `h2.series-list-date-week.${dayOfWeek} + ul.series-list li a`);
    return { items, hasNextPage: false };
  }

  override fetchCollection(ids: string[]): Promise<MangaSummary[]> {
    return this.fetchSeriesPage(ids[0] ?? '', 'ul.series-list li a');
  }

  async fetchSeriesPage(path: string, selector: string): Promise<MangaSummary[]> {
    const document = await this.fetchDocument(`${this.baseUrl}/series${path}`);
    const seen = new Set<string>();
    return document
      .select(selector)
      .flatMap((link): MangaSummary[] => {
        const title = link.selectFirst('h2.series-list-title')?.text();
        const href = link.absUrl('href');
        if (!title || !href) return [];
        const thumbnailUrl = link.selectFirst('div.series-list-thumb img')?.absUrl('data-src');
        return [{ url: this.setSeriesUrl(href, thumbnailUrl), title, thumbnailUrl }];
      })
      .filter((manga) => !seen.has(manga.url) && seen.add(manga.url));
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new ShonenJump().toSource(),
});
