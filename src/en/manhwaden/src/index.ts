import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class ManhwaDen extends MadaraNoAjax {
  readonly name = 'ManhwaDen';
  readonly baseUrl = 'https://www.manhwaden.com';

  override chapterMode = 'MangaAjax' as const;
  override filterNonMangaItems = false;
}

export default defineExtension({
  createSource: () => new ManhwaDen().toSource(),
});
