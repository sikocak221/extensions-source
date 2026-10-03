import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Yaoihub extends Madara {
  readonly name = 'Yaoihub';
  readonly baseUrl = 'https://yaoihub.org';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Yaoihub().toSource(),
});
