import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class ShijieScans extends MangaThemesia {
  readonly name = 'Shijie Scans';
  readonly baseUrl = 'https://shijiescans.com';

  override mangaUrlDirectory = '/seri';
}

export default defineExtension({
  createSource: () => new ShijieScans().toSource(),
});
