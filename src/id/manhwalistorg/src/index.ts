import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class IsekaiKomik extends MangaThemesia {
  readonly name = 'IsekaiKomik';
  readonly baseUrl = 'https://ch1.isekaikomik.site';
}

export default defineExtension({
  createSource: () => new IsekaiKomik().toSource(),
});
