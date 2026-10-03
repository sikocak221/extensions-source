import { defineExtension } from '@matane/extension-sdk';
import { Guya, PREFERRED_GROUP_PREFERENCE } from './guya/Guya';

class DankefrsLesen extends Guya {
  readonly name = 'Danke fürs Lesen';
  readonly baseUrl = 'https://danke.moe';
}

export default defineExtension({
  preferences: () => [PREFERRED_GROUP_PREFERENCE],
  createSource: () => new DankefrsLesen().toSource(),
});
