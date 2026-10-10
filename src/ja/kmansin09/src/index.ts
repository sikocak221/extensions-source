import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class Kmansin09 extends MadaraNoAjax {
  readonly name = 'Kmansin09';
  readonly baseUrl = 'https://kmansin09.top';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Kmansin09().toSource(),
});
