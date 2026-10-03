import { type Chapter, type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

class DarkScience extends SingleSeries {
  readonly name = 'Dark Science';
  readonly baseUrl = 'https://dresdencodak.com';
  readonly series = {
    url: '/category/darkscience/',
    title: 'Dark Science',
    thumbnailUrl: 'https://dresdencodak.com/wp-content/uploads/2019/03/DC_CastIcon_Kimiko.png',
    author: 'Sen (A. Senna Diaz)',
    artist: 'Sen (A. Senna Diaz)',
    description:
      'Scientist Kimiko Ross has a problem: her money’s gone and a bank exploded her house. With no place else to go, she travels to ' +
      'Nephilopolis, the city of giants – built from the ruins of an ancient war and a fading memory of tomorrow.\n Follow our cyborg hero ' +
      'as she attempts to survive the bureaucratic behemoth with a little “help” from her “friends.” And what exactly is Dark Science ' +
      'anyway?\nSupport the comic on Patreon: https://www.patreon.com/dresdencodak',
    genres: ['Science Fiction', 'Mystery', 'LGBT+'],
    status: 'ongoing' as const,
  };

  // The category pages run newest first; "older posts" links lead back in time.
  async getChapters(): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let page: HtmlElement | null = await this.fetchDocument(this.series.url);
    let last = 0;
    for (let guard = 0; page && guard < 200; guard++) {
      for (const a of page.select('#content article header > h2 > a')) {
        const title = a.text();
        const href = a.attr('href') ?? '';
        const number = Number(/Dark Science #(\d+)/.exec(title)?.[1]) || last + 0.01;
        chapters.push({
          url: relativeUrl(href),
          name: title,
          number,
          uploadedAt: parseDate(/\/(\d{4}\/\d\d\/\d\d)\//.exec(href)?.[1], 'yyyy/MM/dd'),
        });
        last = number;
      }
      const next: string | undefined = page.selectFirst('#nav-below .nav-previous > a')?.attr('href');
      page = next ? await this.fetchDocument(next) : null;
    }
    return chapters;
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'article.post img.aligncenter');
  }
}

export default defineExtension({
  createSource: () => new DarkScience().toSource(),
});
