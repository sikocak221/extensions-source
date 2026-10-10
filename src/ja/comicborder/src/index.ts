import { type MangaPage, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class ComicBorder extends GigaViewer {
  readonly name = 'Comic Border';
  readonly baseUrl = 'https://comicborder.com';

  override supportsLatest = false;

  override async getPopular(): Promise<MangaPage> {
    const document = await this.fetchDocument(this.baseUrl);
    const items = document.select('section.top-series').flatMap((section): MangaSummary[] => {
      const title = section.selectFirst('h3')?.text();
      const episode = section.selectFirst('li.first-episode a, li.this-episode a')?.absUrl('href');
      if (!title || !episode) return [];
      const thumbnailUrl = section.selectFirst('.top-key-image')?.absUrl('data-src');
      return [{ url: this.setSeriesUrl(episode, thumbnailUrl), title, thumbnailUrl }];
    });
    return { items, hasNextPage: false };
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new ComicBorder().toSource(),
});
