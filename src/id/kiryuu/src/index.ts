import { defineExtension } from '@matane/extension-sdk';
import { NatsuId } from './natsuid/NatsuId';

class Kiryuu extends NatsuId {
  readonly name = 'Kiryuu';
  readonly baseUrl = 'https://v7.kiryuu.to';

  override chapterListUrl(mangaId: string): string {
    return super.chapterListUrl(mangaId).replace(/([?&])page=\d+/, '$1page=1');
  }
}

export default defineExtension({
  createSource: () => new Kiryuu().toSource(),
});
