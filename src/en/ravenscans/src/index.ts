import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class RavenScans extends MangaThemesia {
  readonly name = 'Raven Scans';
  readonly baseUrl = 'https://ravenscans.org';

  override mangaUrlDirectory = '/manga';
}

export default defineExtension({
  createSource: () => new RavenScans().toSource(),
});
