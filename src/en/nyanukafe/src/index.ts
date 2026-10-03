import { defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class NyanuKafe extends Keyoapp {
  readonly name = 'Nyanu Kafe';
  readonly baseUrl = 'https://nyanukafe.com';

  override popularMangaSelector(): string {
    return '.series-splide .splide__slide:not(.splide__slide--clone)';
  }
  override statusSelector = 'div.w-full.flex-wrap > div:eq(3) > div:last-child';
  override authorSelector = 'div.w-full.flex-wrap > div:eq(0) > div:last-child';
  override artistSelector = 'div.w-full.flex-wrap > div:eq(1) > div:last-child';
  override typeSelector = 'div.w-full.flex-wrap > div:eq(2) > div:last-child';
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new NyanuKafe().toSource(),
});
