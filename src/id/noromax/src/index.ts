import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Noromax extends MangaThemesia {
  readonly name = 'Noromax';
  readonly baseUrl = 'https://noromax02.my.id';

  override hasProjectPage = true;
  override pageSelector = 'div#readerarea img:not(noscript img)';
}

export default defineExtension({
  createSource: () => new Noromax().toSource(),
});
