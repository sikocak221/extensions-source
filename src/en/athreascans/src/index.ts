import { type Chapter, type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { HIDE_PAID_CHAPTERS_PREFERENCE, MangaThemesia } from './mangathemesia/MangaThemesia';

class AthreaScans extends MangaThemesia {
  readonly name = 'Athrea Scans';
  readonly baseUrl = 'https://athreascans.com';

  override chapterListSelector(): string {
    return this.hidePaidChapters(super.chapterListSelector());
  }

  override async chapterListParse(document: HtmlElement): Promise<Chapter[]> {
    return (await super.chapterListParse(document)).filter((c) => c.url && c.url !== '#' && !c.url.endsWith('/#'));
  }
}

export default defineExtension({
  preferences: () => [HIDE_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new AthreaScans().toSource(),
});
