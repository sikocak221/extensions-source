import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Inkapk extends Madara {
  readonly name = "Inkapk";
  readonly baseUrl = "https://inkapk.net";

  override chapterDatePattern = 'MMMM d, yyyy';
  override mangaSubString = 'obras';
  override filterGenresSelector = '.ink-genre-bar';
  override genreDirectory = 'obras-genre';
  override chapterMode = 'MangaAjax' as const;
  override mangaDetailsSelectorTitle = '.ink-det-title';
  override mangaDetailsSelectorThumbnail = '.ink-det-cover img';
  override mangaDetailsSelectorDescription = '.ink-det-desc';
  override mangaDetailsSelectorGenre = '.ink-det-genres .ink-genre-pill';
  override mangaDetailsSelectorStatus = '.lbl:contains(Status) + span';
  override mangaDetailsSelectorAuthor = '.lbl:contains(Autor) + span';
  override mangaDetailsSelectorArtist = '.lbl:contains(Arte) + span';
}

export default defineExtension({
  createSource: () => new Inkapk().toSource(),
});
