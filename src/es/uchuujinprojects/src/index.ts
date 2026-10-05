import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class UchuujinProjects extends MangaThemesia {
  readonly name = 'Uchuujin Projects';
  readonly baseUrl = 'https://uchuujinmangas.com';

  override datePattern = "dd 'de' MMMM 'de' yyyy";
  override hasProjectPage = true;
}

export default defineExtension({
  createSource: () => new UchuujinProjects().toSource(),
});
