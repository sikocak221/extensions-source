import { defineExtension } from '@matane/extension-sdk';
import { ScanReader } from './scanreader/ScanReader';

class ScanReaderSource extends ScanReader {
  readonly name = 'Scan Reader';
  readonly baseUrl = 'https://scanreader.net';
}

export default defineExtension({
  createSource: () => new ScanReaderSource().toSource(),
});
