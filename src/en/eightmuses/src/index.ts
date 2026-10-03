import { type FilterOption, defineExtension } from '@matane/extension-sdk';
import { type Album, AUTHOR, SEARCH_RESULTS_OR_BASE, VARIOUS_AUTHORS, EroMuse } from './eromuse/EroMuse';

const ALBUMS: Album[] = [
  ['All Authors', '', SEARCH_RESULTS_OR_BASE],
  ['Various Authors', 'album/Various-Authors', VARIOUS_AUTHORS],
  ['Fakku Comics', 'album/Fakku-Comics', VARIOUS_AUTHORS],
  ['Hentai and Manga English', 'album/Hentai-and-Manga-English', VARIOUS_AUTHORS],
  ['Fake Celebrities Sex Pictures', 'album/Fake-Celebrities-Sex-Pictures', AUTHOR],
  ['MilfToon Comics', 'album/MilfToon-Comics', AUTHOR],
  ['BE Story Club Comics', 'album/BE-Story-Club-Comics', AUTHOR],
  ['ShadBase Comics', 'album/ShadBase-Comics', AUTHOR],
  ['ZZZ Comics', 'album/ZZZ-Comics', AUTHOR],
  ['PalComix Comics', 'album/PalComix-Comics', AUTHOR],
  ['MCC Comics', 'album/MCC-Comics', AUTHOR],
  ['Expansionfan Comics', 'album/Expansionfan-Comics', AUTHOR],
  ['JAB Comics', 'album/JAB-Comics', AUTHOR],
  ['Giantess Fan Comics', 'album/Giantess-Fan-Comics', AUTHOR],
  ['Renderotica Comics', 'album/Renderotica-Comics', AUTHOR],
  ['IllustratedInterracial.com Comics', 'album/IllustratedInterracial_com-Comics', AUTHOR],
  ['Giantess Club Comics', 'album/Giantess-Club-Comics', AUTHOR],
  ['Innocent Dickgirls Comics', 'album/Innocent-Dickgirls-Comics', AUTHOR],
  ['Locofuria Comics', 'album/Locofuria-Comics', AUTHOR],
  ['PigKing - CrazyDad Comics', 'album/PigKing-CrazyDad-Comics', AUTHOR],
  ['Cartoon Reality Comics', 'album/Cartoon-Reality-Comics', AUTHOR],
  ['Affect3D Comics', 'album/Affect3D-Comics', AUTHOR],
  ['TG Comics', 'album/TG-Comics', AUTHOR],
  ['Melkormancin.com Comics', 'album/Melkormancin_com-Comics', AUTHOR],
  ['Seiren.com.br Comics', 'album/Seiren_com_br-Comics', AUTHOR],
  ['Tracy Scops Comics', 'album/Tracy-Scops-Comics', AUTHOR],
  ['Fred Perry Comics', 'album/Fred-Perry-Comics', AUTHOR],
  ['Witchking00 Comics', 'album/Witchking00-Comics', AUTHOR],
  ['8muses Comics', 'album/8muses-Comics', AUTHOR],
  ['KAOS Comics', 'album/KAOS-Comics', AUTHOR],
  ['Vaesark Comics', 'album/Vaesark-Comics', AUTHOR],
  ['Fansadox Comics', 'album/Fansadox-Comics', AUTHOR],
  ['DreamTales Comics', 'album/DreamTales-Comics', AUTHOR],
  ['Croc Comics', 'album/Croc-Comics', AUTHOR],
  ['Jay Marvel Comics', 'album/Jay-Marvel-Comics', AUTHOR],
  ['JohnPersons.com Comics', 'album/JohnPersons_com-Comics', AUTHOR],
  ['MuscleFan Comics', 'album/MuscleFan-Comics', AUTHOR],
  ['Taboolicious.xxx Comics', 'album/Taboolicious_xxx-Comics', AUTHOR],
  ['MongoBongo Comics', 'album/MongoBongo-Comics', AUTHOR],
  ['Slipshine Comics', 'album/Slipshine-Comics', AUTHOR],
  ['Everfire Comics', 'album/Everfire-Comics', AUTHOR],
  ['PrismGirls Comics', 'album/PrismGirls-Comics', AUTHOR],
  ['Abimboleb Comics', 'album/Abimboleb-Comics', AUTHOR],
  ['Y3DF - Your3DFantasy.com Comics', 'album/Y3DF-Your3DFantasy_com-Comics', AUTHOR],
  ['Grow Comics', 'album/Grow-Comics', AUTHOR],
  ['OkayOkayOKOk Comics', 'album/OkayOkayOKOk-Comics', AUTHOR],
  ['Tufos Comics', 'album/Tufos-Comics', AUTHOR],
  ['Cartoon Valley', 'album/Cartoon-Valley', AUTHOR],
  ['3DMonsterStories.com Comics', 'album/3DMonsterStories_com-Comics', AUTHOR],
  ['Kogeikun Comics', 'album/Kogeikun-Comics', AUTHOR],
  ['The Foxxx Comics', 'album/The-Foxxx-Comics', AUTHOR],
  ['Theme Collections', 'album/Theme-Collections', AUTHOR],
  ['Interracial-Comics', 'album/Interracial-Comics', AUTHOR],
  ['Expansion Comics', 'album/Expansion-Comics', AUTHOR],
  ['Moiarte Comics', 'album/Moiarte-Comics', AUTHOR],
  ['Incognitymous Comics', 'album/Incognitymous-Comics', AUTHOR],
  ['DizzyDills Comics', 'album/DizzyDills-Comics', AUTHOR],
  ['DukesHardcoreHoneys.com Comics', 'album/DukesHardcoreHoneys_com-Comics', AUTHOR],
  ['Stormfeder Comics', 'album/Stormfeder-Comics', AUTHOR],
  ['Bimbo Story Club Comics', 'album/Bimbo-Story-Club-Comics', AUTHOR],
  ['Smudge Comics', 'album/Smudge-Comics', AUTHOR],
  ['Dollproject Comics', 'album/Dollproject-Comics', AUTHOR],
  ['SuperHeroineComixxx', 'album/SuperHeroineComixxx', AUTHOR],
  ['Karmagik Comics', 'album/Karmagik-Comics', AUTHOR],
  ['Blacknwhite.com Comics', 'album/Blacknwhite_com-Comics', AUTHOR],
  ['ArtOfJaguar Comics', 'album/ArtOfJaguar-Comics', AUTHOR],
  ['Kirtu.com Comics', 'album/Kirtu_com-Comics', AUTHOR],
  ['UberMonkey Comics', 'album/UberMonkey-Comics', AUTHOR],
  ['DarkSoul3D Comics', 'album/DarkSoul3D-Comics', AUTHOR],
  ['Markydaysaid Comics', 'album/Markydaysaid-Comics', AUTHOR],
  ['Central Comics', 'album/Central-Comics', AUTHOR],
  ['Frozen Parody Comics', 'album/Frozen-Parody-Comics', AUTHOR],
  ['Blacknwhitecomics.com Comix', 'album/Blacknwhitecomics_com-Comix', AUTHOR],
];

class EightMuses extends EroMuse {
  readonly name = '8Muses';
  readonly baseUrl = 'https://comics.8muses.com';

  albums(): Album[] {
    return ALBUMS;
  }

  sorts(): FilterOption[] {
    return [
      { label: 'Views', value: '' },
      { label: 'Likes', value: 'like' },
      { label: 'Date', value: 'date' },
      { label: 'A-Z', value: 'az' },
    ];
  }
}

export default defineExtension({
  createSource: () => new EightMuses().toSource(),
});
