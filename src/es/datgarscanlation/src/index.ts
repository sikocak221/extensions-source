import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class DatGarScan extends ZeistManga {
  readonly name = 'Dat-Gar Scan';
  readonly baseUrl = 'https://datgarscanlation.blogspot.com';

  override supportsLatest = false;
  override useNewChapterFeed = true;
}

export default defineExtension({
  createSource: () => new DatGarScan().toSource(),
});
