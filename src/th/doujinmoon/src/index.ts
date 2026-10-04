import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class DoujinMoon extends MangaThemesia {
  readonly name = 'Doujin Moon';
  readonly baseUrl = 'https://doujinmoon.com';
}

export default defineExtension({
  createSource: () => new DoujinMoon().toSource(),
});
