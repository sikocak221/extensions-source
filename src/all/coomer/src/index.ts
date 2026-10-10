import { defineExtension } from '@matane/extension-sdk';
import { Kemono, LOW_RES_PREFERENCE, POST_PAGES_PREFERENCE } from './kemono/Kemono';

class Coomer extends Kemono {
  readonly name = 'Coomer';
  readonly baseUrl = 'https://coomer.st';
  override types = ['OnlyFans', 'Fansly', 'CandFans'];
}

export default defineExtension({
  preferences: () => [POST_PAGES_PREFERENCE, LOW_RES_PREFERENCE],
  createSource: () => new Coomer().toSource(),
});
