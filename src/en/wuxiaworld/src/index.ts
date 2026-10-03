import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class WuxiaWorld extends Madara {
  readonly name = 'WuxiaWorld';
  readonly baseUrl = 'https://wuxiaworld.site';

  override mangaSubString = 'novel';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new WuxiaWorld().toSource(),
});
