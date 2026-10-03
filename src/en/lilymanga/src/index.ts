import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class LilyManga extends MadaraNoAjax {
  readonly name = 'Lily Manga';
  readonly baseUrl = 'https://lilymanga.net';

  override chapterDatePattern = 'dd.MM.yyyy';
  override genreDirectory = 'gl-genre';
  override mangaSubString = 'gl';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new LilyManga().toSource(),
});
