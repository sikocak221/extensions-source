import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HotCabaretScan extends Madara {
  readonly name = "Hot Cabaret Scan";
  readonly baseUrl = "https://hotcabaretscan.com";

  override chapterDatePattern = 'MMMM dd, yyyy';
}

export default defineExtension({
  createSource: () => new HotCabaretScan().toSource(),
});
