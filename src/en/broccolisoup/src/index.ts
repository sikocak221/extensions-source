import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class BroccoliSoup extends SingleSeries {
  readonly name = 'Broccoli Soup';
  readonly baseUrl = 'https://politeandgood.com';
  readonly series = {
    url: '/comic/archive',
    title: 'Broccoli Soup',
    author: 'Secret Pie',
    artist: 'Secret Pie',
    status: 'unknown' as const,
    description:
      ' Hello there! How is the Weather? This comic is made by me, Secret Pie. I am a pie with legs who draws comics and makes music. I am also an entomologist.',
    thumbnailUrl: 'https://politeandgood.com/assets/images/static/Bocki%20(correct%20size).png',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    const arcCounts: Record<string, number> = {};
    const chapters: Chapter[] = [{ url: '/comic-characters', name: 'Characters', number: 0 }];
    for (const group of document.select('li.archive-marker')) {
      const arc = group.selectFirst('.archive-header .marker-title')?.text();
      for (const item of group.select('li.archive-page')) {
        const link = item.selectFirst('a');
        const title = link?.selectFirst('span.page-title')?.text();
        if (!link || title === undefined) continue;
        const url = link.attr('href') ?? '';
        const number = Number(url.split('/').pop());
        const parts = [Number.isInteger(number) ? `${number}:` : null, title];
        if (arc) {
          arcCounts[arc] = (arcCounts[arc] ?? 0) + 1;
          parts.push(`(${arc} #${arcCounts[arc]})`);
        }
        chapters.push({
          url: relativeUrl(url),
          name: parts.filter(Boolean).join(' '),
          number: Number.isInteger(number) ? number : undefined,
        });
      }
    }
    return chapters.reverse();
  }

  // The characters page keeps only its pictures (the original also renders the texts as pages).
  getPages(chapter: Chapter): Promise<Page[]> {
    return chapter.url === '/comic-characters'
      ? this.imagesOf(chapter, 'section.static-block figure img')
      : this.imagesOf(chapter, '#comic img');
  }
}

export default defineExtension({
  createSource: () => new BroccoliSoup().toSource(),
});
