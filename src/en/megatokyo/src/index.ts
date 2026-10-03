import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate } from './singleseries/utils';

class Megatokyo extends SingleSeries {
  readonly name = 'Megatokyo';
  readonly baseUrl = 'https://megatokyo.com';
  readonly series = {
    url: '/archive.php?list_by=date',
    title: 'Megatokyo',
    author: 'Fred Gallagher',
    artist: 'Fred Gallagher',
    status: 'ongoing' as const,
    description: 'Relax, we understand j00',
    thumbnailUrl: 'https://i.ibb.co/yWQM1gY/megatokyo.png',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    return document
      .select('div.content h2:contains(Comics by Date) + div ul li a[name]')
      .map((a) => {
        const url = `/${(a.attr('href') ?? '').replace(/^\.?\//, '')}`;
        return {
          url,
          name: a.text(),
          number: Number(url.split('/').pop()) || undefined,
          uploadedAt: parseDate((a.attr('title') ?? '').replace(/(\d+)(st|nd|rd|th)/, '$1'), 'MMMM d, yyyy'),
        };
      })
      .reverse();
  }

  // Image paths are relative to the site root (the page sets <base>).
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(chapter.url);
    return document
      .select('#strip img')
      .map((img) => img.attr('src') ?? '')
      .filter(Boolean)
      .map((src, index) => ({
        index,
        imageUrl: /^https?:/.test(src) ? src : `${this.baseUrl}/${src.replace(/^\.?\//, '')}`,
      }));
  }
}

export default defineExtension({
  createSource: () => new Megatokyo().toSource(),
});
