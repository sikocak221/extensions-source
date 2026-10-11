import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class KamiSamaExplorer extends Madara {
  readonly name = 'Kami Sama Explorer';
  readonly baseUrl = 'https://leitor.kamisama.com.br';

  override chapterDatePattern = "dd 'de' MMMM 'de' yyyy";
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new KamiSamaExplorer().toSource(),
});
