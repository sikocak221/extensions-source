import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class IzanamiScans extends MangaThemesia {
  readonly name = 'Izanami Scans';
  readonly baseUrl = 'https://izanamiscans.my.id';

  override seriesAuthorSelector = '.fmed b:contains(Penulis) + span';
}

export default defineExtension({
  createSource: () => new IzanamiScans().toSource(),
});
