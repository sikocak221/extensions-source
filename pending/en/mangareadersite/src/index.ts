import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class MangaReadersite extends MangaHub {
  readonly name = 'MangaReader.site';
  readonly baseUrl = 'https://mangareader.site';

  override mangaSource = 'mr01';
}

export default defineExtension({
  createSource: () => new MangaReadersite().toSource(),
});
