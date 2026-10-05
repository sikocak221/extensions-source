import { defineExtension } from '@matane/extension-sdk';
import { FoolSlide } from './foolslide/FoolSlide';

class MenudoFansub extends FoolSlide {
  readonly name = 'Menudo-Fansub';
  readonly baseUrl = 'https://www.menudo-fansub.com';

  override urlModifier = '/slide';
}

export default defineExtension({
  createSource: () => new MenudoFansub().toSource(),
});
