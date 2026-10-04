import { type MangaPage, defineExtension } from '@matane/extension-sdk';
import { MMRCMS } from './mmrcms/MMRCMS';

type Suggestion = Parameters<MMRCMS['parseSearchDirectory']>[0][number];

class ScanVF extends MMRCMS {
  readonly name = 'Scan VF';
  readonly baseUrl = 'https://www.scan-vf.net';
  readonly lang = 'fr';

  override itemPath = '';
  override supportsAdvancedSearch = false;

  override parseSearchDirectory(searchDirectory: Suggestion[], page: number): MangaPage {
    const items = searchDirectory.slice((page - 1) * 24, Math.min(page * 24, searchDirectory.length)).map((it) => {
      const url = `/${it.data}`;
      return { url, title: it.value, thumbnailUrl: this.guessCover(url, null) };
    });
    return { items, hasNextPage: (page + 1) * 24 <= searchDirectory.length };
  }
}

export default defineExtension({
  createSource: () => new ScanVF().toSource(),
});
