import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class InventarioOculto extends Madara {
  readonly name = 'Inventario Oculto';
  readonly baseUrl = 'https://inventariooculto.com';

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'dd MMMM, yyyy';
}

export default defineExtension({
  createSource: () => new InventarioOculto().toSource(),
});
