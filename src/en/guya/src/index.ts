import { defineExtension } from '@matane/extension-sdk';
import { Guya, PREFERRED_GROUP_PREFERENCE } from './guya/Guya';

class GuyaMoe extends Guya {
  readonly name = 'Guya';
  readonly baseUrl = 'https://guya.cubari.moe';
}

export default defineExtension({
  preferences: () => [PREFERRED_GROUP_PREFERENCE],
  createSource: () => new GuyaMoe().toSource(),
});
