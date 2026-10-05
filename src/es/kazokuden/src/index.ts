import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class KazokuDen extends MadaraNoAjax {
  readonly name = 'Kazoku Den';
  readonly baseUrl = 'https://www.kazokuden.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new KazokuDen().toSource(),
});
