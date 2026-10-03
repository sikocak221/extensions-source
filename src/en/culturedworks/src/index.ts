import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class CulturedWorks extends MangaThemesia {
  readonly name = 'CulturedWorks';
  readonly baseUrl = 'https://culturedworks.com';

  override seriesDetailsSelector = '.main-info';
  override seriesGenreSelector = '.meta .genres .genre-item';

  constructor() {
    super();
    this.seriesStatusSelector = `.info-right .status, ${this.seriesStatusSelector}`;
  }
}

export default defineExtension({
  createSource: () => new CulturedWorks().toSource(),
});
