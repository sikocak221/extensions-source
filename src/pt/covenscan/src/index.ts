import { type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';
import { hostOf } from './madara/MadaraBase';

class CovenScan extends MadaraNoAjax {
  readonly name = 'Coven Scan';
  readonly baseUrl = 'https://covendasbruxonas.com';

  override chapterMode = 'MangaAjax' as const;
  override mangaDetailsSelectorAuthor = 'div.post-content_item:contains(Author) > div.summary-content';

  // Series live under a prefix: /<scan>/manga/<slug>/
  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^?#]*?\/manga\/[^/?#]+\/?)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
  }
}

export default defineExtension({
  createSource: () => new CovenScan().toSource(),
});
