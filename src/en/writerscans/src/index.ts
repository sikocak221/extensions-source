import { defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class WriterScans extends Keyoapp {
  readonly name = 'Writer Scans';
  readonly baseUrl = 'https://writerscans.com';

  override popularMangaSelector(): string {
    return 'div:contains(Trending) + div .group.overflow-hidden';
  }
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new WriterScans().toSource(),
});
