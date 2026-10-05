import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class GhosToon extends MadaraNoAjax {
  readonly name = 'GhosToon';
  readonly baseUrl = 'https://ghostoon.com';

  override chapterMode = 'MangaAjax' as const;
  override pageListParseSelector = 'div.page-break img.wp-manga-chapter-img';
}

export default defineExtension({
  createSource: () => new GhosToon().toSource(),
});
