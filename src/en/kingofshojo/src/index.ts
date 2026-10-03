import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class KingofShojo extends MangaThemesia {
  readonly name = 'King of Shojo';
  readonly baseUrl = 'https://kingofshojo.com';
}

export default defineExtension({
  createSource: () => new KingofShojo().toSource(),
});
