import { type Chapter, type MangaDetails, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class IAmAnEvilGod extends SingleSeries {
  readonly name = "I'm An Evil God";
  readonly baseUrl = 'https://imanevilgod.com';
  readonly series: MangaDetails = {
    url: '/',
    title: "I'm An Evil God",
    status: 'unknown',
    description:
      "Across the realms, the manliest and most handsome evil god in history! Xie Yan crosses over and falls into the vixen's lair...",
  };

  override async getMangaDetails(): Promise<MangaDetails> {
    const document = await this.fetchDocument('/');
    return { ...this.series, thumbnailUrl: document.selectFirst('meta[property="og:image"]')?.attr('content') };
  }

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument('/');
    return document.select('p.has-medium-font-size a[href*="imanevilgod.com"]').map((a, index) => ({
      url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
      name: a.text(),
      number: index,
    }));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'div.entry-content img', ['src', 'data-src']);
  }
}

export default defineExtension({
  createSource: () => new IAmAnEvilGod().toSource(),
});
