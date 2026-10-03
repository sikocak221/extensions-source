import { defineExtension } from '@matane/extension-sdk';
import { MonochromeCMS } from './monochrome/MonochromeCMS';

class MonochromeScans extends MonochromeCMS {
  readonly name = 'Monochrome Scans';
  readonly baseUrl = 'https://manga.d34d.one';
}

export default defineExtension({
  createSource: () => new MonochromeScans().toSource(),
});
