import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

class VixenLogic extends SingleSeries {
  readonly name = 'Vixen Logic';
  readonly baseUrl = 'https://www.vixenlogic.com';
  readonly series = {
    url: '/',
    title: 'Vixen Logic',
    thumbnailUrl: `${this.baseUrl}/wp-content/uploads/2026/06/VL_Cover_Toocheke.png`,
    author: 'tootaloo and foxboy83',
    status: 'unknown' as const,
  };

  parseDate(text: string): number | undefined {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    if (text.toLowerCase() === 'today') return day.getTime();
    if (text.toLowerCase() === 'yesterday') return day.getTime() - 86_400_000;
    return parseDate(text, 'MMM dd, yyyy');
  }

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument('/archives/');
    // Each .comic-item sits inside its link.
    return document.select('a:has(> .comic-item)').map((a) => ({
      url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
      name: a.selectFirst('.comic-title')?.text() ?? '',
      uploadedAt: this.parseDate(a.selectFirst('.comic-post-date')?.text() ?? ''),
    }));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '#comic p a img');
  }
}

export default defineExtension({
  createSource: () => new VixenLogic().toSource(),
});
