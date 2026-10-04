import { defineExtension } from '@matane/extension-sdk';
import { ScanReader } from './scanreader/ScanReader';

class HentaiScanReader extends ScanReader {
  readonly name = 'Hentai Scan Reader';
  readonly baseUrl = 'https://hentai.scanreader.net';
}

export default defineExtension({
  createSource: () => new HentaiScanReader().toSource(),
});
