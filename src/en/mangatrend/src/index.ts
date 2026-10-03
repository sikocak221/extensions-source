import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class MangaTrend extends MangaThemesia {
  readonly name = 'Manga Trend';
  readonly baseUrl = 'https://mangatrend.org';
}

export default defineExtension({
  createSource: () => new MangaTrend().toSource(),
});
