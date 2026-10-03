import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Sasangeyou extends MangaThemesia {
  readonly name = 'Sasangeyou';
  readonly baseUrl = 'https://sasangeyou.net';

  override datePattern = 'MM/dd/yyyy';
}

export default defineExtension({
  createSource: () => new Sasangeyou().toSource(),
});
