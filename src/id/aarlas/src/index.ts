import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class Aarlas extends ZeistManga {
  readonly name = 'Aarlas';
  readonly baseUrl = 'https://www.arlas.online';

  override preferChapterUpdatedDate = true;
  // Kept from the hand-written 1.0.0 (same filter ids).
  override hasFilters = true;
}

export default defineExtension({
  createSource: () => new Aarlas().toSource(),
});
