import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

class Supermega extends SingleSeries {
  readonly name = 'SUPER MEGA';
  readonly baseUrl = 'https://www.supermegacomics.com';
  readonly series = {
    url: '/',
    title: 'SUPER MEGA',
    author: 'JohnnySmash',
    artist: 'JohnnySmash',
    status: 'ongoing' as const,
    thumbnailUrl: 'https://www.supermegacomics.com/runningman.png',
  };

  // The home page shows the newest comic; its "previous" button links to number - 1.
  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument('/');
    const previous = document.selectFirst("a:has([name='bigbuttonprevious'])")?.attr('href') ?? '';
    const latest = (Number(/[?&]i=(\d+)/.exec(previous)?.[1]) || 0) + 1;
    return Array.from({ length: latest }, (_, i) => latest - i).map((n) => ({
      url: `/?i=${n}`,
      name: String(n),
      number: n,
    }));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, "img[border='4']");
  }
}

export default defineExtension({
  createSource: () => new Supermega().toSource(),
});
