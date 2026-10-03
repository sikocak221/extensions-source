import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class PatchFriday extends SingleSeries {
  readonly name = 'Patch Friday';
  readonly baseUrl = 'https://patchfriday.com';
  readonly series = {
    url: '/',
    title: 'Patch Friday',
    author: 'Patch Friday',
    artist: 'Patch Friday',
    status: 'ongoing' as const,
    thumbnailUrl: 'https://patchfriday.com/patches/68.png',
    description: 'The IT security webcomic',
  };

  // The search page lists ten strips at a time, newest first, paged by "&id=<highest number shown>".
  async getChapters(): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let document = await this.fetchDocument('/search/?search=');
    const latest = Number(
      relativeUrl(
        document.selectFirst('div > div:first-of-type > div:first-of-type > a')?.absUrl('href') ?? '',
      ).replace(/\//g, ''),
    );
    for (let id = latest; id > 0;) {
      for (const a of document.select('div > div > div:first-of-type > a')) {
        const url = relativeUrl(a.absUrl('href') || a.attr('href') || '');
        const number = Number(url.replace(/\//g, ''));
        if (url && number) chapters.push({ url, name: `#${number} - ${a.text()}`, number });
      }
      id -= 10;
      if (id <= 0) break;
      document = await this.fetchDocument(`/search/?search=&id=${id}`);
    }
    // The first strip does not show up in the search.
    chapters.push({ url: '/1/', name: '#1 - The One', number: 1 });
    const seen = new Set<string>();
    return chapters.filter((c) => !seen.has(c.url) && Boolean(seen.add(c.url)));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'div#strip_image img');
  }
}

export default defineExtension({
  createSource: () => new PatchFriday().toSource(),
});
