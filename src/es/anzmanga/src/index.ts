import { defineExtension } from '@matane/extension-sdk';
import { MMRCMS } from './mmrcms/MMRCMS';

class AnzManga extends MMRCMS {
  readonly name = 'AnzManga';
  readonly baseUrl = 'https://www.anzmanga25.com';
  readonly lang = 'es';

  override supportsAdvancedSearch = false;
}

export default defineExtension({
  createSource: () => new AnzManga().toSource(),
});
