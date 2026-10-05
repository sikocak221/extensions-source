import { type HtmlElement, type MangaPage, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class Shadoweviri extends ZeistManga {
  readonly name = 'Shadow Çeviri';
  readonly baseUrl = 'https://shadowceviri.blogspot.com';

  override popularMangaSelector = '.PopularPosts article';
  override popularMangaSelectorTitle = '.post-title a';
  override popularMangaSelectorUrl = '.item-thumbnail > a';
  override mangaDetailsSelector = '#main';
  // The widget lists every series twice (desktop and mobile layouts).
  override parsePopularManga(document: HtmlElement): MangaPage {
    const page = super.parsePopularManga(document);
    const seen = new Set<string>();
    return { ...page, items: page.items.filter((manga) => !seen.has(manga.url) && !!seen.add(manga.url)) };
  }
  override chapterCategory = 'Chapter';
  override pageListSelector = 'div.separator';
}

export default defineExtension({
  createSource: () => new Shadoweviri().toSource(),
});
