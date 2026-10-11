import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class BorutoExplorer extends Madara {
  readonly name = 'Boruto Explorer';
  readonly baseUrl = 'https://leitor.borutoexplorer.com.br';

  override chapterDatePattern = "dd 'de' MMMM 'de' yyyy";
}

export default defineExtension({
  createSource: () => new BorutoExplorer().toSource(),
});
