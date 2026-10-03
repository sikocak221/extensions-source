import { type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Hentai4Free extends Madara {
  readonly name = 'Hentai4Free';
  readonly baseUrl = 'https://hentai4free.net';

  override mangaSubString = 'hentai';
  override archiveSelector(): string {
    return '.page-item-detail';
  }
  override chapterListSelector(): string {
    return 'section.h4f-oneshot-preview';
  }
  override chapterUrlSelector = '.h4f-preview-reader-btn';
  override chapterNameSelector = '.h4f-preview-title small';

  // Pages are a JSON list in #h4f-r2-data.
  override parsePages(document: HtmlElement): Page[] {
    const json = document.selectFirst('#h4f-r2-data')?.html();
    if (!json) return [];
    const data = JSON.parse(json) as { images?: { src: string }[] };
    return (data.images ?? []).map((image, index) => ({ index, imageUrl: image.src }));
  }
}

export default defineExtension({
  createSource: () => new Hentai4Free().toSource(),
});
