import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class CafcomYaoi extends Madara {
  readonly name = 'Café com Yaoi';
  readonly baseUrl = 'https://cafecomyaoi.com.br';

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'dd/MM/yyyy';
}

export default defineExtension({
  createSource: () => new CafcomYaoi().toSource(),
});
