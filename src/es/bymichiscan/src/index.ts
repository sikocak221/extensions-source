import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class BymichiScan extends MangaThemesia {
  readonly name = 'Bymichi Scan';
  readonly baseUrl = 'https://bymichiby.com';

  override hasProjectPage = true;
}

export default defineExtension({
  createSource: () => new BymichiScan().toSource(),
});
