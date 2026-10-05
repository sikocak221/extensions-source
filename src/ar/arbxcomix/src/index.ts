import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ArbxComix extends Madara {
  readonly name = 'ArbxComix';
  readonly baseUrl = 'https://arbxcomix.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new ArbxComix().toSource(),
});
