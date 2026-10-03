import { type MangaPage, defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class GenzToons extends Keyoapp {
  readonly name = 'Genz Toons';
  readonly baseUrl = 'https://genztoons.org';

  override getPopular(): Promise<MangaPage> {
    return this.search('', 1, {});
  }
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new GenzToons().toSource(),
});
