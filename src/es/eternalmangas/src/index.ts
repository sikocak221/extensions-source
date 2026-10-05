import { defineExtension } from '@matane/extension-sdk';
import { Iken } from './iken/Iken';

class EternalMangas extends Iken {
  readonly name = 'EternalMangas';
  readonly baseUrl = 'https://eternalmangas.org';
}

export default defineExtension({
  createSource: () => new EternalMangas().toSource(),
});
