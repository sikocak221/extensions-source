import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Cocomic extends Madara {
  readonly name = 'Cocomic';
  readonly baseUrl = 'https://cocomic.co';

  override chapterMode = 'MangaAjax' as const;
  override chapterListSelector(): string {
    return 'li.wp-manga-chapter:not(.premium)';
  }
}

export default defineExtension({
  createSource: () => new Cocomic().toSource(),
});
