import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class Amuy extends MadaraNoAjax {
  readonly name = 'Amuy';
  readonly baseUrl = 'https://apenasmaisumyaoi.com';

  override chapterDatePattern = "d 'de' MMMM 'de' yyyy";
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Amuy().toSource(),
});
