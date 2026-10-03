import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

class Oglaf extends SingleSeries {
  readonly name = 'Oglaf';
  readonly baseUrl = 'https://www.oglaf.com';
  readonly series = {
    url: '/archive/',
    title: 'Oglaf',
    author: 'Trudy Cooper & Doug Bayne',
    artist: 'Trudy Cooper & Doug Bayne',
    status: 'ongoing' as const,
    description: 'Filth and other Fantastical Things in handy webcomic form.',
    thumbnailUrl: 'https://i.ibb.co/tzY0VQ9/oglaf.png',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    const seen = new Set<string>();
    const urls = document
      .select('a:has(img[width="400"])')
      .map((a) => a.attr('href') ?? '')
      .filter((href) => /\/(.*)\//.test(href) && !seen.has(href) && Boolean(seen.add(href)));
    return urls.map((url, i) => ({ url, name: /\/(.*)\//.exec(url)![1]!, number: urls.length - i }));
  }

  // A strip spans several pages, chained by rel=next links that stay inside it ("/name/2/").
  async getPages(chapter: Chapter): Promise<Page[]> {
    const pages: Page[] = [];
    let url: string | null = chapter.url;
    for (const seen = new Set<string>(); url && !seen.has(url);) {
      seen.add(url);
      const document = await this.fetchDocument(url);
      const img = document.selectFirst('img#strip');
      const src = img?.absUrl('src') || img?.attr('src');
      if (!src) break;
      pages.push({ index: pages.length, imageUrl: src });
      const next = document.selectFirst('a[rel=next]')?.attr('href');
      url = next && /^\/.*\/\d*\/$/.test(next) ? next : null;
    }
    return pages;
  }
}

export default defineExtension({
  createSource: () => new Oglaf().toSource(),
});
