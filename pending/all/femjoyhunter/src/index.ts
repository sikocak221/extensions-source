import { defineExtension } from '@matane/extension-sdk';
import { Masonry } from './masonry/Masonry';

class FemjoyHunter extends Masonry {
  readonly name = "Femjoy Hunter";
  readonly baseUrl = "https://www.femjoyhunter.com";
}

export default defineExtension({
  createSource: () => new FemjoyHunter().toSource(),
});
