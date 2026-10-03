import { defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class MistScans extends Keyoapp {
  readonly name = 'Mist Scans';
  readonly baseUrl = 'https://mistscans.com';

  override popularMangaSelector(): string {
    return '.series-splide .splide__slide';
  }
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new MistScans().toSource(),
});
