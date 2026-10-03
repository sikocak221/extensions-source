import { type HtmlElement, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class ManhwaDesu extends MangaThemesia {
  readonly name = 'ManhwaDesu';
  readonly baseUrl = 'https://manhwadesu.wiki';

  override mangaUrlDirectory = '/komik';

  override imgAttr(element: HtmlElement | null | undefined): string {
    if (!element) return '';
    // Attributes ending in "original-src" first, as in the Kotlin extension.
    for (const name of ['data-original-src', 'original-src', 'data-lazy-src', 'data-src', 'src']) {
      const value = element.attr(name);
      if (value && value.trim()) return element.absUrl(name) || value.trim();
    }
    return '';
  }
}

export default defineExtension({
  createSource: () => new ManhwaDesu().toSource(),
});
