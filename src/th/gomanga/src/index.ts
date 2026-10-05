import { type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class GoManga extends MangaThemesia {
  readonly name = 'Go Manga';
  readonly baseUrl = 'https://www.go-manga.com';

  // Series live at the root of the site ("/<slug>/"): the theme only knows "/<directory>/<slug>/".
  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+\/)(?:[?#].*)?$/i.exec(url.trim());
    if (match && match[1] === this.baseUrl.replace(/^https?:\/\//, '')) return { url: match[2]!, title: '' };
    return super.resolveUrl(url);
  }
}

export default defineExtension({
  createSource: () => new GoManga().toSource(),
});
