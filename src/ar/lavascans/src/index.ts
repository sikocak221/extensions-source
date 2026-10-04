import { type Chapter, type HtmlElement, type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class LavaScans extends MangaThemesia {
  readonly name = 'Lava Scans';
  readonly baseUrl = 'https://lavascans.com';

  override datePattern = 'yyyy/MM/dd';
  searchMangaTitleSelector = '.bigor .tt, h3 a';

  override searchMangaFromElement(element: HtmlElement): MangaSummary {
    const manga = super.searchMangaFromElement(element);
    return {
      ...manga,
      title:
        element.selectFirst(this.searchMangaTitleSelector)?.text() || element.selectFirst('a')?.attr('title') || '',
    };
  }

  override chapterListSelector(): string {
    const base = '#chapters-list-container .ch-item';
    return prefs.get<boolean>('pref_hide_paid_chapters') === false ? base : `${base}:not(.locked)`;
  }

  override chapterFromElement(element: HtmlElement): Chapter {
    const chapter = super.chapterFromElement(element);
    return {
      ...chapter,
      name: element.selectFirst('.ch-num')?.text() || chapter.name,
      uploadedAt: this.parseChapterDate(element.selectFirst('.ch-date')?.text()) ?? chapter.uploadedAt,
    };
  }
  override searchMangaSelector(): string {
    return '.listupd .manga-card-v';
  }
  override seriesDetailsSelector = 'div.lh-container';
  override seriesTitleSelector = '.lh-title';
  override seriesDescriptionSelector = '#manga-story';
  override seriesGenreSelector = '.lh-genres a';
  override seriesStatusSelector = '.status-badge-lux';
  override seriesThumbnailSelector = '.lh-poster img';
}

export default defineExtension({
  createSource: () => new LavaScans().toSource(),
});
