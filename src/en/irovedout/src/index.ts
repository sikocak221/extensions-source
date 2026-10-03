import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

// Chapters are "<first page path>#<book number>"; each page is a site page holding one image.
class IRovedOut extends SingleSeries {
  readonly name = 'I Roved Out';
  readonly baseUrl = 'https://www.irovedout.com';
  readonly series = {
    url: '/',
    title: 'I Roved Out in Search of Truth and Love',
    author: 'Alexis Flower',
    artist: 'Alexis Flower',
    genres: ['Fantasy'],
    status: 'ongoing' as const,
    description:
      'I ROVED OUT IN SEARCH OF TRUTH AND LOVE is written & illustrated by Alexis Flower.\n' +
      'It updates in chunks anywhere between 3 and 30 pages long at least once a month.',
    thumbnailUrl: 'https://i.ibb.co/2g7Htwq/irovedout.png',
  };

  bookUrl(book: number): string {
    return `/archive${book === 1 ? '' : `-book-${book}`}`;
  }

  async getChapters(): Promise<Chapter[]> {
    const home = await this.fetchDocument('/');
    const books = home.select('#menu-menu > li > a[href*="/archive"]');
    const chapters: Chapter[] = [];
    for (let i = 0; i < books.length; i++) {
      const book = await this.fetchDocument(books[i]!.absUrl('href') || books[i]!.attr('href') || '');
      for (const wrap of book.select('.comic-archive-chapter-wrap')) {
        const first = wrap.selectFirst('.comic-archive-title > a');
        if (!first) continue;
        const dates = wrap.select('.comic-archive-date');
        chapters.push({
          url: `${relativeUrl(first.absUrl('href') || first.attr('href') || '')}#${i + 1}`,
          name: `Book ${i + 1}: ${wrap.selectFirst('.comic-archive-chapter')?.text() ?? ''}`,
          number: chapters.length + 1,
          uploadedAt: parseDate(dates[dates.length - 1]?.text(), 'MMM d, yyyy'),
        });
      }
    }
    return chapters.reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [first = '', book = '1'] = chapter.url.split('#');
    const document = await this.fetchDocument(this.bookUrl(Number(book)));
    const wrap = document
      .select('.comic-archive-chapter-wrap')
      .find((w) => relativeUrl(w.selectFirst('.comic-archive-title > a')?.attr('href') ?? '') === first);
    return (wrap?.select('.comic-archive-list-wrap .comic-archive-title > a') ?? []).map((a, index) => ({
      index,
      url: a.absUrl('href') || a.attr('href') || '',
    }));
  }

  override async getImageUrl(page: Page): Promise<string> {
    const img = (await this.fetchDocument(page.url ?? '')).selectFirst('#comic img');
    return img?.absUrl('src') || img?.attr('src') || '';
  }

  override getWebUrl(item: Chapter | { url: string }): string {
    return `${this.baseUrl}${item.url.split('#')[0]}`;
  }
}

export default defineExtension({
  createSource: () => new IRovedOut().toSource(),
});
