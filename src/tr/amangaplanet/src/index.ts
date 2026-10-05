import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class AmangaPlanet extends MangaThemesia {
  readonly name = 'Amanga Planet';
  readonly baseUrl = 'https://www.amangaplanet.com.tr';

  override datePattern = 'dd/MM/yyyy';
}

export default defineExtension({
  createSource: () => new AmangaPlanet().toSource(),
});
