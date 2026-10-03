import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadSoloLevelingMangaManhwaOnline extends MangaCatalog {
  readonly name = 'Read Solo Leveling Manga Manhwa Online';
  readonly sourceList: [string, string][] = [
    ['Solo Leveling Manhwa', '/manga/solo-leveling/'],
    ['Solo Leveling Light Novel', '/manga/solo-leveling-light-novel/'],
    ['Solo Leveling : Ragnarok', '/manga/solo-leveling-ragnarok/'],
    ['SL: Ragnarok Novel', '/manga/solo-leveling-ragnarok-novel/'],
  ];
  readonly baseUrl = 'https://ww4.readsololeveling.org';
}

export default defineExtension({
  createSource: () => new ReadSoloLevelingMangaManhwaOnline().toSource(),
});
