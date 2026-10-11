import { defineExtension } from '@matane/extension-sdk';
import { WPComics } from './wpcomics/WPComics';

class Raw18 extends WPComics {
  readonly name = 'Raw18';
  readonly baseUrl = 'https://raw18.bar';

  override datePattern = "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'";
  override searchPath = 'search/manga';
  override genresUrlDelimiter = '=';
  override popularMangaSelector(): string {
    return 'div.items .item';
  }
  override popularMangaNextPageSelector(): string {
    return 'li:nth-last-child(2) a.page-link';
  }
}

export default defineExtension({
  createSource: () => new Raw18().toSource(),
});
