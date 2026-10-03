import { type HtmlElement, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { HIDE_PAID_CHAPTERS_PREFERENCE, MangaThemesia } from './mangathemesia/MangaThemesia';

class ThunderScans extends MangaThemesia {
  readonly name = 'Thunder Scans';
  readonly baseUrl = 'https://en-thunderscans.com';

  override mangaUrlDirectory = '/comics';

  searchMangaTitleSelector = '.bigor .tt, h3 a';

  override searchMangaFromElement(element: HtmlElement): MangaSummary {
    const manga = super.searchMangaFromElement(element);
    return { ...manga, title: element.selectFirst(this.searchMangaTitleSelector)?.text() || manga.title };
  }

  override chapterListSelector(): string {
    return this.hidePaidChapters(super.chapterListSelector());
  }
}

export default defineExtension({
  preferences: () => [HIDE_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new ThunderScans().toSource(),
});
