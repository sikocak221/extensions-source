import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadNanatsunoTaizai7DeadlySinsMangaOnline extends MangaCatalog {
  readonly name = 'Read Nanatsu no Taizai 7 Deadly Sins Manga Online';
  readonly sourceList: [string, string][] = [
    ['Four Horsemen of the Apocalypse', '/manga/four-horsemen-of-the-apocalypse/'],
    ['7DS: School', '/manga/mayoe-nanatsu-no-taizai-gakuen/'],
    ['7DS:7 Days', '/manga/nanatsu-no-taizai-seven-days/'],
    ['7DS:Vampires', '/manga/nanatsu-no-taizai-vampires-of-edinburgh/'],
    ['Queen of Altar', '/manga/the-queen-of-the-altar/'],
    ['7DS: 7 Colors', '/manga/nanatsu-no-taizai-nanairo-no-tsuioku/'],
    ['7DS x FT', '/manga/fairy-tail-x-nanatsu-no-taizai-christmas-special/'],
    ['Kongou Banchou', '/manga/kongou-banchou/'],
    ['7DS:7 Scars', '/manga/nanatsu-no-taizai-the-seven-scars-which-they-left-behind/'],
    ['7 Deadly Sins', '/manga/nanatsu-no-taizai/'],
    ['Mokushiroku no Yonkishi', '/manga/four-horsemen-of-the-apocalypse/'],
  ];
  readonly baseUrl = 'https://ww8.read7deadlysins.com';
}

export default defineExtension({
  createSource: () => new ReadNanatsunoTaizai7DeadlySinsMangaOnline().toSource(),
});
