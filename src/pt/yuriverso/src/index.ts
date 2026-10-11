import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class YurionAir extends MadaraNoAjax {
  readonly name = 'Yuri on Air';
  readonly baseUrl = 'https://yurionair.top';

  override chapterDatePattern = 'dd/MM/yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new YurionAir().toSource(),
});
