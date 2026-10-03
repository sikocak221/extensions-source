import { type Filter, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class FrierenOnline extends Madara {
  readonly name = 'Frieren Online';
  readonly baseUrl = 'https://www.frieren.online';

  override supportsLatest = false;
  override mangaDetailsSelectorTitle = '.about h1';
  override mangaDetailsSelectorAuthor = 'h5:contains(Author) + h4';
  override mangaDetailsSelectorArtist = 'h5:contains(Artist) + h4';
  override mangaDetailsSelectorStatus = 'h5:contains(Status) + h4';
  override mangaDetailsSelectorDescription = '.synopsis';
  override mangaDetailsSelectorThumbnail = '.cover_managa img';
  override mangaDetailsSelectorGenre = '.tags a[rel=tag]';
  override chapterListSelector(): string {
    return 'li.m-chapter';
  }
  override chapterUrlSelector = 'a:has(.chapter-content)';

  override async getFilters(): Promise<Filter[]> {
    return [];
  }
}

export default defineExtension({
  createSource: () => new FrierenOnline().toSource(),
});
