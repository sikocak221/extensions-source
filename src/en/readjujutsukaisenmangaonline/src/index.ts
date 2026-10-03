import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadJujutsuKaisenMangaOnline extends MangaCatalog {
  readonly name = 'Read Jujutsu Kaisen Manga Online';
  readonly sourceList: [string, string][] = [
    ['Jujutsu Kaisen', '/manga/jujutsu-kaisen/'],
    ['Jujutsu Kaisen 0', '/manga/jujutsu-kaisen-0/'],
    ['JJK Colored', '/manga/jujutsu-kaisen-colored/'],
    ['Fan Scan', '/manga/jujutsu-kaisen-fan-scan/'],
    ['JJK Light Novel', '/manga/jujutsu-kaisen-first-light-novel/'],
    ['2nd Light Novel', '/manga/jujutsu-kaisen-second-light-novel/'],
    ['No.9', '/manga/no-9/'],
    ['Fanbook', '/manga/jujutsu-kaisen-official-fanbook/'],
  ];
  readonly baseUrl = 'https://ww6.readjujutsukaisen.com';
}

export default defineExtension({
  createSource: () => new ReadJujutsuKaisenMangaOnline().toSource(),
});
