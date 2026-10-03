import { defineExtension } from '@matane/extension-sdk';
import { MangaCatalog } from './mangacatalog/MangaCatalog';

class ReadChainsawManMangaOnline extends MangaCatalog {
  readonly name = 'Read Chainsaw Man Manga Online';
  readonly sourceList: [string, string][] = [
    ['Chainsaw Man', '/manga/chainsaw-man/'],
    ['17-21', '/manga/17-21-fujimoto-tatsuki-tanpenshuu/'],
    ['Fire Punch', '/manga/fire-punch/'],
    ['Nayuta', '/manga/yogen-no-nayuta/'],
    ['Look Back', '/manga/look-back/'],
    ['Light Novel', '/manga/chainsaw-man-buddy-stories/'],
    ['Colored', '/manga/chainsaw-man-colored/'],
    ['Listen to Song', '/manga/futsuu-ni-kiite-kure/'],
    ['Goodbye, Eri', '/manga/sayonara-eri-goodbye-eri/'],
    ['22-26', '/manga/22-26-fujimoto-tatsuki-tanpenshuu/'],
    ['Chainsaw Man Colored', '/manga/chainsaw-man-colored/'],
    ['Chainsaw Man: Buddy Stories', '/manga/chainsaw-man-buddy-stories/'],
  ];
  readonly baseUrl = 'https://ww6.readchainsawman.com';
}

export default defineExtension({
  createSource: () => new ReadChainsawManMangaOnline().toSource(),
});
