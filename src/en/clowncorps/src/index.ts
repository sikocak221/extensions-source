import { type Chapter, type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

interface Cached {
  url: string;
  name: string;
  date?: number;
}

class ClownCorps extends SingleSeries {
  readonly name = 'Clown Corps';
  readonly baseUrl = 'https://clowncorps.net';
  readonly series = {
    url: '/comic',
    title: 'Clown Corps',
    author: 'Joe Chouinard',
    artist: 'Joe Chouinard',
    status: 'ongoing' as const,
    thumbnailUrl: 'https://clowncorps.net/wp-content/uploads/2022/11/clowns41.jpg',
    description: 'Clown Corps is a comic about crime-fighting clowns.\nIt\'s pronounced "core." Like marine corps.',
  };

  extract(document: HtmlElement): Cached[] {
    return document.select('.comic').flatMap((post): Cached[] => {
      const link = post.selectFirst('.post-title a');
      if (!link) return [];
      const date =
        `${post.selectFirst('.post-date')?.text() ?? ''} ${post.selectFirst('.post-time')?.text() ?? ''}`.trim();
      return [
        { url: relativeUrl(link.attr('href') ?? ''), name: link.text(), date: parseDate(date, 'MMMM d, yyyy h:mm a') },
      ];
    });
  }

  // The archive pages run newest first: stop at the first page that adds nothing to the cached list.
  async getChapters(): Promise<Chapter[]> {
    const cached = new Map(((await storage.get<Cached[]>('chapters')) ?? []).map((c) => [c.url, c]));
    const first = await this.fetchDocument(this.series.url);
    const total =
      Number(
        first
          .select('#paginav li.paginav-pages')
          .map((e) => e.text())
          .join(' ')
          .split(' ')
          .pop(),
      ) || 1;
    for (let page = 1; page <= total; page++) {
      const document = page === 1 ? first : await this.fetchDocument(`/comic/page/${page}/`);
      let added = false;
      for (const c of this.extract(document)) {
        if (!cached.has(c.url)) {
          cached.set(c.url, c);
          added = true;
        }
      }
      if (!added) break;
    }
    const all = [...cached.values()].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    await storage.set('chapters', all);
    return all.map((c) => ({ url: c.url, name: c.name, uploadedAt: c.date }));
  }

  // Not ported: the author's notes (image title) rendered as a text page.
  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '#comic img');
  }
}

export default defineExtension({
  createSource: () => new ClownCorps().toSource(),
});
