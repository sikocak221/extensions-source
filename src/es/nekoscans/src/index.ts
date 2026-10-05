import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class NekoScans extends MangaThemesia {
  readonly name = 'NekoScans';
  readonly baseUrl = 'https://nekoproject.org';
}

export default defineExtension({
  createSource: () => new NekoScans().toSource(),
});
