import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class OOTS extends SingleSeries {
  readonly name = 'The Order Of The Stick (OOTS)';
  readonly baseUrl = 'https://www.giantitp.com';
  readonly series = {
    url: '/comics/oots.html',
    title: 'The Order Of The Stick',
    author: 'Rich Burlew',
    artist: 'Rich Burlew',
    status: 'ongoing' as const,
    description: 'Having fun with games.',
    thumbnailUrl: 'https://i.giantitp.com/redesign/Icon_Comics_OOTS.gif',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    // The site shows no dates: remember when each strip was first seen.
    const firstSeen = (await storage.get<Record<string, number>>('first_seen')) ?? {};
    const now = Date.now();
    const seen = new Set<string>();
    const chapters: Chapter[] = [];
    for (const a of document.select('p.ComicList a')) {
      const url = relativeUrl(a.absUrl('href') || a.attr('href') || '');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const number = /oots(\d+)\.html/.exec(url)?.[1];
      if (number) firstSeen[number] ??= now;
      chapters.push({
        url,
        name: a.text(),
        number: number ? Number(number) : undefined,
        uploadedAt: number ? firstSeen[number] : undefined,
      });
    }
    await storage.set('first_seen', firstSeen);
    return chapters;
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, "td[align='center'] > img");
  }
}

export default defineExtension({
  createSource: () => new OOTS().toSource(),
});
