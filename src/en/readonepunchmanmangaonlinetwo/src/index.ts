import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadOnePunchManMangaOnline extends MangaCatalog {
  readonly name = 'Read One-Punch Man Manga Online';
  readonly sourceList: [string, string][] = [
    ['One Punch Man', '/manga/one-punch-man/'],
    ['Official', '/manga/one-punch-man-official/'],
    ['Onepunch-Man (ONE)', '/manga/onepunch-man-one/'],
    ['Colored', '/manga/one-punch-man-colored/'],
    ['Mob Psycho 100', '/manga/mob-psycho-100/'],
    ['Reigen', '/manga/reigen/'],
    ['Versus (ONE)', '/manga/versus/'],
    ['Bug Ego', '/manga/bug-ego/'],
    ['Eyeshield 21', '/manga/eyeshield-21/'],
  ];
  readonly baseUrl = 'https://ww7.readopm.com';

  override chapterListSelector(): string {
    return 'tbody > tr';
  }
}

export default defineExtension({
  createSource: () => new ReadOnePunchManMangaOnline().toSource(),
});
