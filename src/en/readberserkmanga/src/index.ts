import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadBerserkManga extends MangaCatalog {
  readonly name = 'Read Berserk Manga';
  readonly sourceList: [string, string][] = [
    ['Berserk', '/manga/berserk/'],
    ['Guidebook', '/manga/berserk-official-guidebook/'],
    ['Colored', '/manga/berserk-colored/'],
    ['Duranki', '/manga/duranki/'],
    ['Gigantomakhia', '/manga/gigantomakhia/'],
    ['Futatabi', '/manga/futatabi/'],
    ['Berserk Spoilers & RAW', '/manga/berserk-spoilers-raw/'],
  ];
  readonly baseUrl = 'https://readberserk.com';

  override chapterListSelector(): string {
    return 'tbody > tr';
  }
}

export default defineExtension({
  createSource: () => new ReadBerserkManga().toSource(),
});
