import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class KumaPoi extends MangaThemesia {
  readonly name = 'KumaPoi';
  readonly baseUrl = 'https://kumapoi.info';
}

export default defineExtension({
  createSource: () => new KumaPoi().toSource(),
});
