import { defineExtension } from '@matane/extension-sdk';
import { Masonry } from './masonry/Masonry';

class EliteBabes extends Masonry {
  readonly name = 'Elite Babes';
  readonly baseUrl = 'https://www.elitebabes.com';

  // The home page only lists tag tiles: browse the archive instead.
  override popularMangaUrl(page: number): string {
    return page === 1 ? `${this.baseUrl}/archive/` : `${this.baseUrl}/archive/page/${page}/`;
  }
}

export default defineExtension({
  createSource: () => new EliteBabes().toSource(),
});
