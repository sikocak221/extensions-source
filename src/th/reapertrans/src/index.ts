import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class ReaperTrans extends MangaThemesia {
  readonly name = 'ReaperTrans';
  readonly baseUrl = 'https://reapertrans.com';
}

export default defineExtension({
  createSource: () => new ReaperTrans().toSource(),
});
