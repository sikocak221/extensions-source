import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TopManhuanet extends Madara {
  readonly name = 'TopManhua.net';
  readonly baseUrl = 'https://topmanhua.net';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new TopManhuanet().toSource(),
});
