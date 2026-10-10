import { type HtmlElement, type Page, defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class TraduesdoLipe extends ZeistManga {
  readonly name = 'Traduções do Lipe';
  readonly baseUrl = 'https://traducoesdolipe.blogspot.com';

  override supportsLatest = false;
  override mangaCategory = 'Projeto';
  override chapterCategory = 'Capítulo';
  override hasFilters = true;
  override hasStatusFilter = false;
  override hasTypeFilter = false;
  override hasLanguageFilter = false;
  override hasGenreFilter = true;
  override mangaDetailsSelector = '.main-content';
  override mangaDetailsSelectorAuthor = 'li:contains(Autor) > span';
  override mangaDetailsSelectorArtist = 'li:contains(Ilustração) > span';
  override mangaDetailsSelectorDescription = '.synopsis';
  override mangaDetailsSelectorGenres = '.genres a';
  override mangaDetailsSelectorStatus = '.status';

  override getChapterFeedUrl(document: HtmlElement, mangaTitle: string): string {
    const script = document.select('script').map((s) => s.html()).find((h) => h.includes('catNameProject')) ?? '';
    const label = /=\s+?\('([^']+)/.exec(script)?.[1] ?? mangaTitle;
    return super.getChapterFeedUrl(document, label);
  }

  override pageListParse(document: HtmlElement): Page[] {
    const script = document.selectFirst('.chapter script')?.html() ?? '';
    const json = /=(\[[^\]]+\])/.exec(script)?.[1];
    const pages: string[] = json ? JSON.parse(json) : [];
    return pages.map((imageUrl, index) => ({ index, imageUrl }));
  }
}

export default defineExtension({
  createSource: () => new TraduesdoLipe().toSource(),
});
