import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class LonerTranslations extends ZeistManga {
  readonly name = 'Loner Translations';
  readonly baseUrl = 'https://loner-tl.blogspot.com';
}

export default defineExtension({
  createSource: () => new LonerTranslations().toSource(),
});
