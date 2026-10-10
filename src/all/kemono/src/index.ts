import { defineExtension } from '@matane/extension-sdk';
import { Kemono, LOW_RES_PREFERENCE, POST_PAGES_PREFERENCE } from './kemono/Kemono';

class KemonoSite extends Kemono {
  readonly name = 'Kemono';
  readonly baseUrl = 'https://kemono.cr';
  override types = ['Patreon', 'Pixiv Fanbox', 'Discord', 'Fantia', 'Afdian', 'Boosty', 'Gumroad', 'SubscribeStar'];
}

export default defineExtension({
  preferences: () => [POST_PAGES_PREFERENCE, LOW_RES_PREFERENCE],
  createSource: () => new KemonoSite().toSource(),
});
