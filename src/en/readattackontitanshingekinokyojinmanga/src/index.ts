import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadAttackonTitanShingekinoKyojinManga extends MangaCatalog {
  readonly name = 'Read Attack on Titan Shingeki no Kyojin Manga';
  readonly sourceList: [string, string][] = [
    ['Shingeki No Kyojin', '/manga/shingeki-no-kyojin/'],
    ['Colored', '/manga/shingeki-no-kyojin-colored/'],
    ['Before the Fall', '/manga/shingeki-no-kyojin-before-the-fall/'],
    ['Lost Girls', '/manga/shingeki-no-kyojin-lost-girls/'],
    ['No Regrets', '/manga/attack-on-titan-no-regrets/'],
    ['Junior High', '/manga/attack-on-titan-junior-high/'],
    ['Guidebook', '/manga/attack-on-titan-guidebook-inside-outside/'],
    ['Harsh Mistress', '/manga/attack-on-titan-harsh-mistress-of-the-city/'],
    ['Anthology', '/manga/attack-on-titan-anthology/'],
    ['Art Book', '/manga/attack-on-titan-exclusive-art-book/'],
    ['Spoof', '/manga/spoof-on-titan/'],
    ['No Regrets Colored', '/manga/attack-on-titan-no-regrets-colored/'],
    ['BTF Light Novel', '/manga/attack-on-titan-before-the-fall-light-novel/'],
    ['Best of SNK', '/manga/the-best-of-attack-on-titan-in-color/'],
  ];
  readonly baseUrl = 'https://ww12.readsnk.com';

  override chapterListSelector(): string {
    return 'div.w-full div.grid div.col-span-4';
  }
}

export default defineExtension({
  createSource: () => new ReadAttackonTitanShingekinoKyojinManga().toSource(),
});
