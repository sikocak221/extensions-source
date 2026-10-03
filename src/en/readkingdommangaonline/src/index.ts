import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadKingdomMangaOnline extends MangaCatalog {
  readonly name = 'Read Kingdom Manga Online';
  readonly sourceList: [string, string][] = [
    ['Kingdom', '/manga/kingdom/'],
    ['Li Mu', '/manga/li-mu/'],
    ['Meng Wu & Chu Zi', '/manga/meng-wu-and-chu-zi-one-shot/'],
  ];
  readonly baseUrl = 'https://ww6.readkingdom.com';
}

export default defineExtension({
  createSource: () => new ReadKingdomMangaOnline().toSource(),
});
