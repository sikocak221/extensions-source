import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadTokyoGhoulReTokyoGhoulMangaOnline extends MangaCatalog {
  readonly name = 'Read Tokyo Ghoul Re & Tokyo Ghoul Manga Online';
  readonly sourceList: [string, string][] = [
    ['Tokyo Ghoul', '/manga/tokyo-ghoul/'],
    ['Tokyo Ghoul Jack', '/manga/tokyo-ghoul-jack/'],
    ['Tokyo Ghoul: re Colored', '/manga/tokyo-ghoulre-colored/'],
    ['Gorilla', '/manga/this-gorilla-will-die-in-1-day/'],
    ['Zakki', '/manga/tokyo-ghoul-zakki/'],
    ['Light Novel', '/manga/tokyo-ghoul-re-light-novels/'],
    ['Choujin X', '/manga/choujin-x/'],
    ['Tokyo Ghoul re', '/manga/tokyo-ghoulre/'],
  ];
  readonly baseUrl = 'https://ww12.tokyoghoulre.com';
}

export default defineExtension({
  createSource: () => new ReadTokyoGhoulReTokyoGhoulMangaOnline().toSource(),
});
