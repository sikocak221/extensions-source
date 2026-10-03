import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Ngomik extends MangaThemesia {
  readonly name = 'Ngomik';
  readonly baseUrl = 'https://02.ngomik.cc';

  override userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.163 Safari/537.36';
  override projectPageString = '/pj';
  override hasProjectPage = true;
}

export default defineExtension({
  createSource: () => new Ngomik().toSource(),
});
