import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { pathOf } from './madara/MadaraBase';
import { Madara } from './madara/Madara';

class BattleIn5SecondsAfterMeeting extends Madara {
  readonly name = 'Battle In 5 Seconds After Meeting';
  readonly baseUrl = 'https://www.deatte5.com';

  override supportsLatest = false;
  override mangaDetailsSelectorTitle = 'h1';
  override mangaDetailsSelectorAuthor = 'h5:contains(Author) + h4 a';
  override mangaDetailsSelectorArtist = 'h5:contains(Artist) + h4 a';
  override mangaDetailsSelectorDescription = '.synopsis p';
  override mangaDetailsSelectorThumbnail = '.cover_managa img';
  override mangaDetailsSelectorStatus = 'h5:contains(Status) + h4';
  override mangaDetailsSelectorTag = 'h5:contains(Tag) + h4 a';
  override seriesTypeSelector = 'h5:contains(Type) + h4';
  override altNameSelector = 'h5:contains(Alternative) + h4';

  override async parseChapterList(document: HtmlElement, _mangaPath: string): Promise<Chapter[]> {
    const dates = new Map<string, number | undefined>();
    for (const item of document.select('.chapter-item')) {
      const href = item.selectFirst('a')?.absUrl('href');
      if (href) dates.set(href, this.parseChapterDate(item.selectFirst('.post-on')?.text()));
    }
    return document.select('.main-chapter').flatMap((element): Chapter[] => {
      const href = element.selectFirst('a')?.absUrl('href');
      if (!href) return [];
      return [
        {
          url: pathOf(href),
          name: (element.selectFirst('.chapter-content')?.text() ?? '').replace(
            /^Battle in 5 Seconds After Meeting, /,
            '',
          ),
          uploadedAt: dates.get(href),
        },
      ];
    });
  }
}

export default defineExtension({
  createSource: () => new BattleIn5SecondsAfterMeeting().toSource(),
});
